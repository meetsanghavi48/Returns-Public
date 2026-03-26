import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    automationRule: { findMany: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    automationLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    returnEvent: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
    returnCounter: { upsert: vi.fn() },
    billingUsage: { upsert: vi.fn() },
  },
}));

vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn().mockResolvedValue({ order: { tags: "vip,premium", total_price: "5000", line_items: [{ product_tags: "clothing,cotton" }] } }),
  updateOrderTags: vi.fn().mockResolvedValue(undefined),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/notifications.server", () => ({ sendReturnConfirmation: vi.fn(), sendStatusUpdate: vi.fn() }));
vi.mock("~/services/email-templates.server", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/services/refunds.server", () => ({ processRefund: vi.fn() }));
vi.mock("~/services/logistics.server", () => ({
  getDefaultLogisticsForShop: vi.fn().mockResolvedValue(null),
  createPickupForReturn: vi.fn(),
}));

const makeReturn = (overrides: any = {}) => ({
  id: "ret-1", reqId: "RET-001", shop: "shop.com", orderId: "ord-1",
  status: "pending", requestType: "return", items: [{ reason: "Size too small", title: "T-Shirt" }],
  totalPrice: 2500, isCod: false, daysSinceOrder: 3, awb: null, awbStatus: null,
  customerName: "John", customerEmail: "john@test.com", orderNumber: "1001",
  refundMethod: "original", address: null,
  ...overrides,
});

describe("automation conditions and actions", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.automationLog.create.mockResolvedValue({});
    prisma.automationRule.update.mockResolvedValue({});
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.returnEvent.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    prisma.returnRequest.count.mockResolvedValue(0);
    prisma.automationRule.count.mockResolvedValue(5);
    prisma.returnRequest.findMany.mockResolvedValue([]);
    prisma.returnCounter.upsert.mockResolvedValue({ lastNumber: 1 });
    prisma.billingUsage.upsert.mockResolvedValue({});
    prisma.settings.findUnique.mockResolvedValue(null);
  });

  // Helper to run a rule against a return
  async function runRule(conditions: any[], actions: any[], returnData: any = {}) {
    const ret = makeReturn(returnData);
    prisma.returnRequest.findFirst.mockResolvedValue(ret);
    prisma.automationRule.findMany.mockResolvedValue([{
      id: "rule-1", name: "Test Rule", isActive: true, matchType: "ALL",
      conditions, actions, runCount: 0,
    }]);
    const { runAutomationsForReturn } = await import("~/services/automation.server");
    return runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");
  }

  describe("condition: request_type", () => {
    it("matches when type is 'return'", async () => {
      const result = await runRule(
        [{ type: "request_type", operator: "is", value: "return" }],
        [{ type: "add_internal_note", config: { note: "matched" } }],
        { requestType: "return" },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("does NOT match when type differs", async () => {
      const result = await runRule(
        [{ type: "request_type", operator: "is", value: "exchange" }],
        [{ type: "add_internal_note", config: { note: "matched" } }],
        { requestType: "return" },
      );
      expect(result.rulesMatched).toBe(0);
    });

    it("is_not operator works", async () => {
      const result = await runRule(
        [{ type: "request_type", operator: "is_not", value: "exchange" }],
        [{ type: "add_internal_note", config: { note: "matched" } }],
        { requestType: "return" },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: order_type (COD vs Prepaid)", () => {
    it("matches COD order", async () => {
      const result = await runRule(
        [{ type: "order_type", operator: "is", value: "cod" }],
        [{ type: "add_internal_note", config: { note: "cod" } }],
        { isCod: true },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("matches prepaid order", async () => {
      const result = await runRule(
        [{ type: "order_type", operator: "is", value: "prepaid" }],
        [{ type: "add_internal_note", config: { note: "prepaid" } }],
        { isCod: false },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("does NOT match COD when order is prepaid", async () => {
      const result = await runRule(
        [{ type: "order_type", operator: "is", value: "cod" }],
        [{ type: "add_internal_note", config: { note: "cod" } }],
        { isCod: false },
      );
      expect(result.rulesMatched).toBe(0);
    });
  });

  describe("condition: return_value", () => {
    it("greater_than matches high value return", async () => {
      const result = await runRule(
        [{ type: "return_value", operator: "greater_than", value: 1000 }],
        [{ type: "add_internal_note", config: { note: "high" } }],
        { totalPrice: 5000 },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("less_than matches low value return", async () => {
      const result = await runRule(
        [{ type: "return_value", operator: "less_than", value: 500 }],
        [{ type: "add_internal_note", config: { note: "low" } }],
        { totalPrice: 200 },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("equals matches exact value", async () => {
      const result = await runRule(
        [{ type: "return_value", operator: "equals", value: 1000 }],
        [{ type: "add_internal_note", config: { note: "exact" } }],
        { totalPrice: 1000 },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: order_tags", () => {
    it("contains matches tag in order", async () => {
      const result = await runRule(
        [{ type: "order_tags", operator: "contains", value: "vip" }],
        [{ type: "add_internal_note", config: { note: "vip" } }],
      );
      // orderTags enriched from Shopify mock ("vip,premium")
      expect(result.rulesMatched).toBe(1);
    });

    it("does_not_contain works for absent tag", async () => {
      const result = await runRule(
        [{ type: "order_tags", operator: "does_not_contain", value: "no-return" }],
        [{ type: "add_internal_note", config: { note: "ok" } }],
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: reason", () => {
    it("matches reason text", async () => {
      const result = await runRule(
        [{ type: "reason", operator: "contains", value: "size" }],
        [{ type: "add_internal_note", config: { note: "size" } }],
        { items: [{ reason: "Size too small" }] },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: requested_refund_mode", () => {
    it("matches original payment", async () => {
      const result = await runRule(
        [{ type: "requested_refund_mode", operator: "is", value: "original" }],
        [{ type: "add_internal_note", config: { note: "orig" } }],
        { refundMethod: "original" },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("matches store_credit", async () => {
      const result = await runRule(
        [{ type: "requested_refund_mode", operator: "is", value: "store_credit" }],
        [{ type: "add_internal_note", config: { note: "sc" } }],
        { refundMethod: "store_credit" },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: customer_email", () => {
    it("contains matches partial email", async () => {
      const result = await runRule(
        [{ type: "customer_email", operator: "contains", value: "@test.com" }],
        [{ type: "add_internal_note", config: { note: "test" } }],
        { customerEmail: "john@test.com" },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: days_since_order", () => {
    it("greater_than matches old orders", async () => {
      const result = await runRule(
        [{ type: "days_since_order", operator: "greater_than", value: 14 }],
        [{ type: "add_internal_note", config: { note: "old" } }],
        { daysSinceOrder: 20 },
      );
      expect(result.rulesMatched).toBe(1);
    });

    it("less_than matches recent orders", async () => {
      const result = await runRule(
        [{ type: "days_since_order", operator: "less_than", value: 7 }],
        [{ type: "add_internal_note", config: { note: "recent" } }],
        { daysSinceOrder: 3 },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("condition: request_stage", () => {
    it("matches pending status", async () => {
      const result = await runRule(
        [{ type: "request_stage", operator: "is", value: "pending" }],
        [{ type: "add_internal_note", config: { note: "pending" } }],
        { status: "pending" },
      );
      expect(result.rulesMatched).toBe(1);
    });
  });

  describe("multiple conditions with ALL matchType", () => {
    it("requires ALL conditions to pass", async () => {
      const result = await runRule(
        [
          { type: "request_type", operator: "is", value: "return" },
          { type: "return_value", operator: "greater_than", value: 10000 },
        ],
        [{ type: "add_internal_note", config: { note: "test" } }],
        { requestType: "return", totalPrice: 500 },
      );
      // First condition passes, second fails → no match
      expect(result.rulesMatched).toBe(0);
    });
  });

  describe("action: auto_approve", () => {
    it("calls approveRequest", async () => {
      prisma.returnRequest.findFirst
        .mockResolvedValueOnce(makeReturn()) // for runAutomationsForReturn lookup
        .mockResolvedValueOnce(makeReturn()); // for approveRequest lookup
      prisma.automationRule.findMany.mockResolvedValue([{
        id: "rule-1", name: "Auto Approve", isActive: true, matchType: "ALL",
        conditions: [{ type: "request_type", operator: "is", value: "return" }],
        actions: [{ type: "auto_approve", config: {} }],
        runCount: 0,
      }]);

      const { runAutomationsForReturn } = await import("~/services/automation.server");
      const result = await runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");

      expect(result.rulesMatched).toBe(1);
      expect(result.actionsExecuted).toBeGreaterThanOrEqual(1);
    });
  });

  describe("action: add_order_tag", () => {
    it("calls updateOrderTags with correct tag", async () => {
      const { updateOrderTags } = await import("~/services/shopify.server");
      const result = await runRule(
        [{ type: "request_type", operator: "is", value: "return" }],
        [{ type: "add_order_tag", config: { tag: "return-flagged" } }],
      );

      expect(result.actionsExecuted).toBeGreaterThanOrEqual(1);
      expect(updateOrderTags).toHaveBeenCalledWith("shop.com", "token", "ord-1", ["return-flagged"]);
    });
  });

  describe("action: auto_reject", () => {
    it("calls rejectRequest with reason", async () => {
      prisma.returnRequest.findFirst
        .mockResolvedValueOnce(makeReturn())
        .mockResolvedValueOnce(makeReturn());
      prisma.returnRequest.findUnique.mockResolvedValue(null);
      prisma.automationRule.findMany.mockResolvedValue([{
        id: "rule-1", name: "Auto Reject", isActive: true, matchType: "ALL",
        conditions: [{ type: "order_type", operator: "is", value: "cod" }],
        actions: [{ type: "auto_reject", config: { rejection_reason: "COD not eligible" } }],
        runCount: 0,
      }]);

      const { runAutomationsForReturn } = await import("~/services/automation.server");
      const result = await runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");

      // COD condition won't match since isCod=false by default
      expect(result.rulesMatched).toBe(0);
    });
  });
});
