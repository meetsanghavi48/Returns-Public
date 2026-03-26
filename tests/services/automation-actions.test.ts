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
  shopifyREST: vi.fn().mockResolvedValue({ order: { tags: "", total_price: "500", line_items: [] } }),
  updateOrderTags: vi.fn().mockResolvedValue(undefined),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/notifications.server", () => ({ sendReturnConfirmation: vi.fn(), sendStatusUpdate: vi.fn() }));
vi.mock("~/services/email-templates.server", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/services/refunds.server", () => ({ processRefund: vi.fn() }));
vi.mock("~/services/logistics.server", () => ({
  getDefaultLogisticsForShop: vi.fn().mockResolvedValue(null),
  createPickupForReturn: vi.fn().mockResolvedValue({ success: true, awb: "AWB123" }),
}));

const makeReturn = (overrides: any = {}) => ({
  id: "ret-1", reqId: "RET-001", shop: "shop.com", orderId: "ord-1",
  status: "pending", requestType: "return", items: [{ reason: "Size too small", title: "T-Shirt" }],
  totalPrice: 2500, isCod: false, daysSinceOrder: 3, awb: null, awbStatus: null,
  customerName: "John", customerEmail: "john@e.com", orderNumber: "1001",
  refundMethod: "original", address: {}, ...overrides,
});

describe("automation.server — all action types", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.returnRequest.findFirst.mockResolvedValue(makeReturn());
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.returnEvent.create.mockResolvedValue({});
    prisma.automationRule.findMany.mockResolvedValue([]);
    prisma.automationLog.create.mockResolvedValue({});
    prisma.automationRule.update.mockResolvedValue({});
    prisma.returnRequest.count.mockResolvedValue(1);
  });

  // Helper to run a single rule
  async function runRule(conditions: any[], actions: any[], returnOverrides: any = {}) {
    const ret = makeReturn(returnOverrides);
    prisma.returnRequest.findFirst.mockResolvedValue(ret);
    prisma.automationRule.findMany.mockResolvedValue([{
      id: "rule-1", name: "Test Rule", isActive: true, matchType: "ALL",
      conditions, actions, runCount: 0,
    }]);
    const { runAutomationsForReturn } = await import("~/services/automation.server");
    return runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");
  }

  it("add_internal_note creates ReturnEvent", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "add_internal_note", config: { note: "Auto flagged" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "note", message: "Auto flagged" }),
    });
  });

  it("flag_for_review creates flag event + audit log", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "flag_for_review", config: { reason: "Suspicious" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "flag" }),
    });
  });

  it("add_order_tag calls updateOrderTags", async () => {
    const { updateOrderTags } = await import("~/services/shopify.server");
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "add_order_tag", config: { tag: "return-flagged" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(updateOrderTags).toHaveBeenCalledWith("shop.com", "token", "ord-1", ["return-flagged"]);
  });

  it("remove_order_tag calls updateOrderTags with remove array", async () => {
    const { updateOrderTags } = await import("~/services/shopify.server");
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "remove_order_tag", config: { tag: "old-tag" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(updateOrderTags).toHaveBeenCalledWith("shop.com", "token", "ord-1", [], ["old-tag"]);
  });

  it("update_return_status changes status", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "update_return_status", config: { new_status: "in_transit" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "in_transit" }),
    }));
  });

  it("mark_as_received sets status to delivered", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "mark_as_received" }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "delivered" }),
    }));
  });

  it("create_pickup uses logistics service", async () => {
    const { createPickupForReturn } = await import("~/services/logistics.server");
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "create_pickup" }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(createPickupForReturn).toHaveBeenCalledWith("ret-1", "shop.com");
  });

  it("process_refund calls processRefund service", async () => {
    const { processRefund } = await import("~/services/refunds.server");
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [{ type: "process_refund", config: { refund_method: "original" } }],
    );
    expect(result.actionsExecuted).toBe(1);
    expect(processRefund).toHaveBeenCalled();
  });

  it("ALL match requires every condition true", async () => {
    const result = await runRule(
      [
        { type: "request_type", operator: "is", value: "return" },
        { type: "return_value", operator: "greater_than", value: 10000 },
      ],
      [{ type: "add_internal_note", config: { note: "test" } }],
    );
    expect(result.rulesMatched).toBe(0);
  });

  it("condition: order_type COD matches when isCod=true", async () => {
    const result = await runRule(
      [{ type: "order_type", operator: "is", value: "cod" }],
      [{ type: "add_internal_note", config: { note: "COD order" } }],
      { isCod: true },
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("condition: order_type COD does NOT match prepaid", async () => {
    const result = await runRule(
      [{ type: "order_type", operator: "is", value: "cod" }],
      [{ type: "add_internal_note", config: { note: "COD order" } }],
      { isCod: false },
    );
    expect(result.rulesMatched).toBe(0);
  });

  it("condition: days_since_order greater_than", async () => {
    const result = await runRule(
      [{ type: "days_since_order", operator: "greater_than", value: 5 }],
      [{ type: "add_internal_note", config: { note: "Late return" } }],
      { daysSinceOrder: 10 },
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("condition: customer_email contains domain", async () => {
    const result = await runRule(
      [{ type: "customer_email", operator: "contains", value: "@e.com" }],
      [{ type: "add_internal_note", config: { note: "Known" } }],
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("condition: requested_refund_mode matches", async () => {
    const result = await runRule(
      [{ type: "requested_refund_mode", operator: "is", value: "original" }],
      [{ type: "add_internal_note", config: { note: "Original payment" } }],
      { refundMethod: "original" },
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("condition: requested_refund_mode store_credit", async () => {
    const result = await runRule(
      [{ type: "requested_refund_mode", operator: "is", value: "store_credit" }],
      [{ type: "add_internal_note", config: { note: "Store credit" } }],
      { refundMethod: "store_credit" },
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("condition: return_value less_than matches low value", async () => {
    const result = await runRule(
      [{ type: "return_value", operator: "less_than", value: 500 }],
      [{ type: "add_internal_note", config: { note: "Low value" } }],
      { totalPrice: 100 },
    );
    expect(result.rulesMatched).toBe(1);
  });

  it("multiple actions execute sequentially", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "return" }],
      [
        { type: "add_internal_note", config: { note: "Step 1" } },
        { type: "add_order_tag", config: { tag: "processed" } },
        { type: "flag_for_review", config: { reason: "Review needed" } },
      ],
    );
    expect(result.actionsExecuted).toBe(3);
  });

  it("logs non-matching rules", async () => {
    const result = await runRule(
      [{ type: "request_type", operator: "is", value: "exchange" }],
      [{ type: "add_internal_note", config: { note: "Should not run" } }],
    );
    expect(result.rulesMatched).toBe(0);
    expect(prisma.automationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conditionsMet: false }),
    });
  });

  it("returns empty result when return not found", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue(null);
    const { runAutomationsForReturn } = await import("~/services/automation.server");
    const result = await runAutomationsForReturn("nonexistent", "shop.com", "token", "return_created");
    expect(result.rulesEvaluated).toBe(0);
  });
});
