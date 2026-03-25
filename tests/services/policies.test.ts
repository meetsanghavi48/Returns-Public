import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    settings: { findMany: vi.fn(), findUnique: vi.fn() },
    returnRequest: { findMany: vi.fn() },
  },
}));

const makeOrder = (overrides: any = {}) => ({
  id: "order-1", order_number: 1001, tags: "", financial_status: "paid",
  created_at: new Date().toISOString(), total_price: "500",
  discount_codes: [], fulfillments: [{ status: "success" }], line_items: [],
  ...overrides,
});

describe("policies.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.settings.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.returnRequest.findMany.mockResolvedValue([]);
  });

  describe("validateOrderEligibility", () => {
    it("returns eligible for valid order within return window", async () => {
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 5);
      expect(result.eligible).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects order outside return window", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "return_window_days", value: 7 }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 10);
      expect(result.eligible).toBe(false);
      expect(result.errors[0]).toContain("return window");
    });

    it("uses default 30-day window when no setting", async () => {
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 25);
      expect(result.eligible).toBe(true);
    });

    it("rejects order below min value", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "restrict_return_min_value", value: 1000 }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder({ total_price: "500" }), 1);
      expect(result.eligible).toBe(false);
      expect(result.errors[0]).toContain("below");
    });

    it("rejects order above max value", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "restrict_return_max_value", value: 200 }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder({ total_price: "500" }), 1);
      expect(result.eligible).toBe(false);
      expect(result.errors[0]).toContain("above");
    });

    it("rejects order with blocked discount code", async () => {
      prisma.settings.findMany.mockResolvedValue([
        { key: "restrict_return_discount_codes", value: true },
        { key: "restrict_return_discount_code_list", value: "NORETURN,FINAL" },
      ]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder({
        discount_codes: [{ code: "NORETURN" }],
      }), 1);
      expect(result.eligible).toBe(false);
      expect(result.errors[0]).toContain("discount code");
    });

    it("allows order without blocked discount codes", async () => {
      prisma.settings.findMany.mockResolvedValue([
        { key: "restrict_return_discount_codes", value: true },
        { key: "restrict_return_discount_code_list", value: "NORETURN" },
      ]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder({
        discount_codes: [{ code: "WELCOME10" }],
      }), 1);
      expect(result.eligible).toBe(true);
    });

    it("rejects undelivered order when restrict_undelivered enabled", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "restrict_return_undelivered", value: true }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder({
        fulfillments: [{ status: "pending" }],
      }), 1);
      expect(result.eligible).toBe(false);
      expect(result.errors[0]).toContain("delivered");
    });

    it("blocks duplicate return when multiple returns disabled", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "allow_multiple_returns", value: false }]);
      prisma.returnRequest.findMany.mockResolvedValue([{ reqId: "REQ-001", status: "pending" }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 1);
      expect(result.eligible).toBe(false);
      expect(result.multipleReturnsMode).toBe("blocked");
      expect(result.errors[0]).toContain("already been submitted");
    });

    it("appends to existing pending request when multiple returns enabled", async () => {
      prisma.returnRequest.findMany.mockResolvedValue([{ reqId: "REQ-001", status: "pending" }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 1);
      expect(result.multipleReturnsMode).toBe("append");
      expect(result.existingRequestId).toBe("REQ-001");
    });

    it("creates new request when existing is beyond pickup", async () => {
      prisma.returnRequest.findMany.mockResolvedValue([{ reqId: "REQ-001", status: "in_transit" }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 1);
      expect(result.multipleReturnsMode).toBe("new");
    });

    it("returns exchange allowed based on exchange window", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "exchange_window_days", value: 5 }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 10);
      expect(result.exchangeAllowed).toBe(false);
    });

    it("returns blocked return tags", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "restrict_return_tags", value: "no-return, final-sale" }]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 1);
      expect(result.blockedReturnTags).toContain("no-return");
      expect(result.blockedReturnTags).toContain("final-sale");
    });

    it("returns fees from settings", async () => {
      prisma.settings.findMany.mockResolvedValue([
        { key: "restocking_fee_pct", value: 15 },
        { key: "return_shipping_fee", value: 99 },
      ]);
      const { validateOrderEligibility } = await import("~/services/policies.server");
      const result = await validateOrderEligibility("shop.com", makeOrder(), 1);
      expect(result.fees.restockingFee).toBe(15);
      expect(result.fees.returnShippingFee).toBe(99);
    });
  });

  describe("validateExchangeEligibility", () => {
    it("allows exchange within window", async () => {
      const { validateExchangeEligibility } = await import("~/services/policies.server");
      const result = await validateExchangeEligibility("shop.com", makeOrder(), 5);
      expect(result.allowed).toBe(true);
    });

    it("rejects exchange outside window", async () => {
      prisma.settings.findMany.mockResolvedValue([{ key: "exchange_window_days", value: 7 }]);
      const { validateExchangeEligibility } = await import("~/services/policies.server");
      const result = await validateExchangeEligibility("shop.com", makeOrder(), 10);
      expect(result.allowed).toBe(false);
    });
  });

  describe("calculateFees", () => {
    it("calculates restocking fee on return items", async () => {
      const { calculateFees } = await import("~/services/policies.server");
      const result = calculateFees(
        [{ price: "1000", qty: 1, action: "return" }],
        { restockingFee: 10, returnShippingFee: 0, exchangeShippingFee: 0, taxRate: 0 },
      );
      expect(result.restockingFee).toBe(100);
      expect(result.refundAmount).toBe(900);
    });

    it("adds shipping fees for returns and exchanges separately", async () => {
      const { calculateFees } = await import("~/services/policies.server");
      const result = calculateFees(
        [
          { price: "500", qty: 1, action: "return" },
          { price: "500", qty: 1, action: "exchange" },
        ],
        { restockingFee: 0, returnShippingFee: 50, exchangeShippingFee: 75, taxRate: 0 },
      );
      expect(result.shippingFee).toBe(125);
      expect(result.refundAmount).toBe(375); // 500 - 50 - 75
    });

    it("returns zero refund when fees exceed item value", async () => {
      const { calculateFees } = await import("~/services/policies.server");
      const result = calculateFees(
        [{ price: "50", qty: 1, action: "return" }],
        { restockingFee: 50, returnShippingFee: 100, exchangeShippingFee: 0, taxRate: 0 },
      );
      expect(result.refundAmount).toBe(0);
    });

    it("handles exchange-only items", async () => {
      const { calculateFees } = await import("~/services/policies.server");
      const result = calculateFees(
        [{ price: "800", qty: 2, action: "exchange" }],
        { restockingFee: 0, returnShippingFee: 0, exchangeShippingFee: 0, taxRate: 0 },
      );
      expect(result.itemTotal).toBe(1600);
      expect(result.restockingFee).toBe(0);
    });
  });
});
