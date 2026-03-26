import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { findFirst: vi.fn(), update: vi.fn() },
    exchangeCounter: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));

vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn(),
  updateOrderTags: vi.fn(),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/settings.server", () => ({
  getSetting: vi.fn().mockResolvedValue(false),
}));

const MOCK_REQUEST = {
  reqId: "req-1",
  orderId: "order-1",
  orderNumber: "1002",
  items: [
    { action: "exchange", exchange_variant_id: "v1", price: "24.95", qty: "1", exchange_price: "49.95" },
  ],
  address: { name: "Test" },
};

describe("exchanges.server — exchange rules", () => {
  let prisma: any;
  let shopifyREST: any;
  let getSetting: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    shopifyREST = (await import("~/services/shopify.server")).shopifyREST;
    getSetting = (await import("~/services/settings.server")).getSetting;

    prisma.exchangeCounter.update.mockResolvedValue({ lastNumber: 9001 });
    prisma.returnRequest.update.mockResolvedValue({});
    shopifyREST.mockImplementation((shop: string, token: string, method: string, path: string) => {
      if (path.includes("orders/") && method === "GET") return { order: { email: "t@t.com", shipping_address: {}, customer: { id: 1 } } };
      if (path.includes("draft_orders.json") && method === "POST") return { draft_order: { id: "d1" } };
      if (path.includes("complete.json")) return { draft_order: { order_id: "new1", name: "#EXC9001" } };
      return {};
    });
  });

  it("creates exchange order with correct Shopify data", async () => {
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    const result = await createExchangeOrder("shop.com", "token", MOCK_REQUEST);
    expect(result).toBeTruthy();
    expect(result!.order_name).toBe("EXC9001");
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "exchange_fulfilled" }),
    }));
  });

  it("adds on-hold tag when exchange_hold_orders is enabled", async () => {
    getSetting.mockImplementation((shop: string, key: string) => {
      if (key === "exchange_hold_orders") return true;
      return false;
    });
    const { updateOrderTags } = await import("~/services/shopify.server");
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    await createExchangeOrder("shop.com", "token", MOCK_REQUEST);
    expect(updateOrderTags).toHaveBeenCalledWith("shop.com", "token", "new1", ["exchange-on-hold"]);
  });

  it("does NOT add on-hold tag when exchange_hold_orders is disabled", async () => {
    getSetting.mockResolvedValue(false);
    const { updateOrderTags } = await import("~/services/shopify.server");
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    await createExchangeOrder("shop.com", "token", MOCK_REQUEST);
    // updateOrderTags is called for exchange-fulfilled tag, but NOT for exchange-on-hold
    const calls = (updateOrderTags as any).mock.calls;
    const holdCall = calls.find((c: any) => c[3]?.includes("exchange-on-hold"));
    expect(holdCall).toBeUndefined();
  });

  it("logs price diff refund when auto_refund is enabled and new is cheaper", async () => {
    getSetting.mockImplementation((shop: string, key: string) => {
      if (key === "refund_price_difference") return true;
      return false;
    });
    const cheapRequest = {
      ...MOCK_REQUEST,
      items: [{ action: "exchange", exchange_variant_id: "v1", price: "49.95", qty: "1", exchange_price: "24.95" }],
    };
    const { auditLog } = await import("~/services/audit.server");
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    await createExchangeOrder("shop.com", "token", cheapRequest);
    expect(auditLog).toHaveBeenCalledWith(
      "shop.com", "order-1", "req-1", "exchange_price_diff_refund", "system", expect.any(String),
    );
  });

  it("does NOT log price diff when exchanged item is same price", async () => {
    getSetting.mockImplementation((shop: string, key: string) => {
      if (key === "refund_price_difference") return true;
      return false;
    });
    const samePriceRequest = {
      ...MOCK_REQUEST,
      items: [{ action: "exchange", exchange_variant_id: "v1", price: "49.95", qty: "1", exchange_price: "49.95" }],
    };
    const { auditLog } = await import("~/services/audit.server");
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    await createExchangeOrder("shop.com", "token", samePriceRequest);
    const diffCall = (auditLog as any).mock.calls.find((c: any) => c[3] === "exchange_price_diff_refund");
    expect(diffCall).toBeUndefined();
  });

  it("returns null when no exchange items", async () => {
    const noExchangeRequest = { ...MOCK_REQUEST, items: [{ action: "return", price: "49.95", qty: "1" }] };
    const { createExchangeOrder } = await import("~/services/exchanges.server");
    const result = await createExchangeOrder("shop.com", "token", noExchangeRequest);
    expect(result).toBeNull();
  });
});
