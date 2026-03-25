import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    exchangeCounter: { update: vi.fn() },
    returnRequest: { update: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn(),
  updateOrderTags: vi.fn().mockResolvedValue(undefined),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));

describe("exchanges.server", () => {
  let prisma: any;
  let shopifyREST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    shopifyREST = (await import("~/services/shopify.server")).shopifyREST;
    prisma.exchangeCounter.update.mockResolvedValue({ lastNumber: 9001 });
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
  });

  describe("createExchangeOrder", () => {
    it("returns null when no exchange items", async () => {
      const { createExchangeOrder } = await import("~/services/exchanges.server");
      const result = await createExchangeOrder("shop.com", "token", {
        reqId: "REQ-001", orderId: "ord-1", items: [{ action: "return", title: "Shirt" }],
      });
      expect(result).toBeNull();
    });

    it("returns null when exchange items have no variant", async () => {
      const { createExchangeOrder } = await import("~/services/exchanges.server");
      const result = await createExchangeOrder("shop.com", "token", {
        reqId: "REQ-001", orderId: "ord-1", items: [{ action: "exchange", title: "Shirt" }],
      });
      expect(result).toBeNull();
    });

    it("creates draft order for exchange items", async () => {
      shopifyREST
        .mockResolvedValueOnce({ order: { email: "john@test.com", shipping_address: {}, customer: { id: 123 } } })
        .mockResolvedValueOnce({ draft_order: { id: "draft-1" } })
        .mockResolvedValueOnce({ draft_order: { order_id: "new-ord-1", name: "#EXC9001" } });

      const { createExchangeOrder } = await import("~/services/exchanges.server");
      const result = await createExchangeOrder("shop.com", "token", {
        reqId: "REQ-001", orderId: "ord-1", orderNumber: "1001",
        items: [{ action: "exchange", title: "Shirt", exchange_variant_id: "var-123", qty: 1, price: "500" }],
      });

      expect(shopifyREST).toHaveBeenCalledWith("shop.com", "token", "POST", "draft_orders.json", expect.anything());
    });
  });
});
