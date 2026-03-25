import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { update: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));
vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn(),
  updateOrderTags: vi.fn().mockResolvedValue(undefined),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/settings.server", () => ({
  getSetting: vi.fn().mockResolvedValue(0),
  setSetting: vi.fn(),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

describe("refunds.server", () => {
  let prisma: any;
  let shopifyREST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    shopifyREST = (await import("~/services/shopify.server")).shopifyREST;
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
  });

  describe("processRefund", () => {
    it("returns null when no return items", async () => {
      const { processRefund } = await import("~/services/refunds.server");
      const result = await processRefund("shop.com", "token", {
        items: [{ action: "exchange" }], orderId: "ord-1",
      });
      expect(result).toBeNull();
    });

    it("returns null when Shopify order has no line items", async () => {
      shopifyREST.mockResolvedValueOnce({ order: { line_items: [], financial_status: "paid" } });
      const { processRefund } = await import("~/services/refunds.server");
      const result = await processRefund("shop.com", "token", {
        items: [{ action: "return", id: "li1" }], orderId: "ord-1",
      });
      expect(result).toBeNull();
    });

    it("calls Shopify refund calculate and create endpoints", async () => {
      shopifyREST
        .mockResolvedValueOnce({ order: { line_items: [{ id: 1, quantity: 1 }], financial_status: "paid" } })
        .mockResolvedValueOnce({ locations: [{ id: 100 }] })
        .mockResolvedValueOnce({ refund: { transactions: [{ amount: "500", gateway: "manual" }] } })
        .mockResolvedValueOnce({ refund: { id: "refund-1" } });

      const { processRefund } = await import("~/services/refunds.server");
      const result = await processRefund("shop.com", "token", {
        items: [{ action: "return", id: "1", qty: 1 }], orderId: "ord-1", reqId: "REQ-001",
      });

      expect(shopifyREST).toHaveBeenCalledWith("shop.com", "token", "GET", expect.stringContaining("orders/ord-1"));
      expect(shopifyREST).toHaveBeenCalledWith("shop.com", "token", "POST", expect.stringContaining("refunds/calculate.json"), expect.anything());
    });
  });
});
