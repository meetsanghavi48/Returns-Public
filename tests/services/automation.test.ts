import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
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
  shopifyREST: vi.fn().mockResolvedValue({ order: { tags: "", total_price: "1000", line_items: [] } }),
  updateOrderTags: vi.fn(),
  uid: vi.fn(() => "uid"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/notifications.server", () => ({
  sendReturnConfirmation: vi.fn(),
  sendStatusUpdate: vi.fn(),
}));
vi.mock("~/services/email-templates.server", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/services/refunds.server", () => ({ processRefund: vi.fn() }));

describe("automation.server", () => {
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
    prisma.automationRule.count.mockResolvedValue(0);
    prisma.automationRule.create.mockResolvedValue({});
    prisma.automationRule.createMany.mockResolvedValue({});
    prisma.returnRequest.findMany.mockResolvedValue([]);
  });

  describe("runAutomationsForReturn", () => {
    it("skips inactive rules", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "ret-1", reqId: "RET-001", shop: "shop.com", orderId: "ord-1",
        status: "pending", requestType: "return", items: [], totalPrice: 500,
        isCod: false, daysSinceOrder: 2, awb: null, awbStatus: null,
        customerName: "John", customerEmail: "j@e.com", orderNumber: "1001",
        refundMethod: "original", address: null,
      });
      prisma.automationRule.findMany.mockResolvedValue([
        { id: "rule-1", name: "Auto Approve", isActive: false, matchType: "ALL", conditions: [], actions: [], runCount: 0 },
      ]);

      const { runAutomationsForReturn } = await import("~/services/automation.server");
      const result = await runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");

      expect(result.rulesMatched).toBe(0);
      expect(result.actionsExecuted).toBe(0);
    });

    it("runs active rules and logs results", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "ret-1", reqId: "RET-001", shop: "shop.com", orderId: "ord-1",
        status: "pending", requestType: "exchange", items: [], totalPrice: 500,
        isCod: false, daysSinceOrder: 2, awb: null, awbStatus: null,
        customerName: "John", customerEmail: "j@e.com", orderNumber: "1001",
        refundMethod: null, address: null,
      });
      prisma.automationRule.findMany.mockResolvedValue([
        {
          id: "rule-1", name: "Auto Approve Exchange", isActive: true, matchType: "ALL",
          conditions: [{ type: "request_type", operator: "is", value: "exchange" }],
          actions: [{ type: "auto_approve", config: {} }],
          runCount: 0,
        },
      ]);
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "ret-1", reqId: "RET-001", orderId: "ord-1", shop: "shop.com", requestType: "exchange",
      });

      const { runAutomationsForReturn } = await import("~/services/automation.server");
      const result = await runAutomationsForReturn("ret-1", "shop.com", "token", "return_created");

      expect(result.rulesEvaluated).toBeGreaterThanOrEqual(1);
      expect(prisma.automationLog.create).toHaveBeenCalled();
    });

    it("returns empty result when no return found", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue(null);

      const { runAutomationsForReturn } = await import("~/services/automation.server");
      const result = await runAutomationsForReturn("nonexistent", "shop.com", "token", "return_created");

      expect(result.rulesEvaluated).toBe(0);
      expect(result.rulesMatched).toBe(0);
    });
  });

  describe("ensureDefaultRules", () => {
    it("creates default rules for new shop", async () => {
      prisma.automationRule.findMany.mockResolvedValue([]);

      const { ensureDefaultRules } = await import("~/services/automation.server");
      await ensureDefaultRules("new-shop.com");

      // Should not throw
    });
  });
});
