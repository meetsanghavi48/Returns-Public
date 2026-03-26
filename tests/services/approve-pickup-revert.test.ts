import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    returnCounter: { upsert: vi.fn() },
    returnEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
    automationRule: { findMany: vi.fn() },
    automationLog: { create: vi.fn() },
    billingUsage: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    logisticsConfig: { findFirst: vi.fn() },
  },
}));

vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn(),
  updateOrderTags: vi.fn(),
  uid: vi.fn(() => "mock-req-id"),
}));
vi.mock("~/services/audit.server", () => ({ auditLog: vi.fn() }));
vi.mock("~/services/automation.server", () => ({
  runAutomationsForReturn: vi.fn().mockResolvedValue({ rulesEvaluated: 0, rulesMatched: 0, actionsExecuted: 0, errors: [] }),
  ensureDefaultRules: vi.fn(),
}));
vi.mock("~/services/email-templates.server", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/services/notifications.server", () => ({
  sendReturnConfirmation: vi.fn(),
  sendStatusUpdate: vi.fn(),
}));

// Mock logistics.server — dynamically imported by approveRequest
vi.mock("~/services/logistics.server", () => ({
  getDefaultLogisticsForShop: vi.fn(),
  createPickupForReturn: vi.fn(),
}));

const MOCK_RETURN = {
  id: "db-id",
  reqId: "req-1",
  orderId: "order-1",
  shop: "shop.com",
  requestType: "return",
  customerName: "John",
  customerEmail: "john@e.com",
  orderNumber: "1001",
  awb: null,
};

describe("approveRequest — pickup failure revert", () => {
  let prisma: any;
  let getDefaultLogisticsForShop: any;
  let createPickupForReturn: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    const logistics = await import("~/services/logistics.server");
    getDefaultLogisticsForShop = logistics.getDefaultLogisticsForShop;
    createPickupForReturn = logistics.createPickupForReturn;

    // Default mocks
    prisma.returnRequest.findFirst.mockResolvedValue({ ...MOCK_RETURN });
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.returnEvent.create.mockResolvedValue({});
    prisma.automationRule.findMany.mockResolvedValue([]);
  });

  // ──────────────────────────────────────────────────────────────
  // A. No logistics configured — approval succeeds without pickup
  // ──────────────────────────────────────────────────────────────

  it("approves normally when no logistics configured", async () => {
    getDefaultLogisticsForShop.mockResolvedValue(null);
    const { approveRequest } = await import("~/services/returns.server");

    await approveRequest("shop.com", "token", "req-1");

    // Status set to approved
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }),
    );
    // No pickup attempted
    expect(createPickupForReturn).not.toHaveBeenCalled();
    // No revert
    expect(prisma.returnRequest.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) }),
    );
  });

  it("sends notification when approved without logistics", async () => {
    getDefaultLogisticsForShop.mockResolvedValue(null);
    const { sendNotification } = await import("~/services/email-templates.server");
    const { approveRequest } = await import("~/services/returns.server");

    await approveRequest("shop.com", "token", "req-1");

    expect(sendNotification).toHaveBeenCalledWith(
      "shop.com", "return_approved", "req-1", expect.any(Object),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // B. Logistics configured, pickup succeeds
  // ──────────────────────────────────────────────────────────────

  it("approves and creates pickup when logistics configured and pickup succeeds", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: true, awb: "AWB123" });
    const { approveRequest } = await import("~/services/returns.server");

    await approveRequest("shop.com", "token", "req-1");

    // Status set to approved
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }),
    );
    // Pickup was attempted with correct returnId
    expect(createPickupForReturn).toHaveBeenCalledWith("db-id", "shop.com");
    // No revert to pending
    expect(prisma.returnRequest.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) }),
    );
    // No pickup_failed event
    expect(prisma.returnEvent.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "pickup_failed" }) }),
    );
  });

  it("sends notification after successful pickup", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: true, awb: "AWB123" });
    const { sendNotification } = await import("~/services/email-templates.server");
    const { approveRequest } = await import("~/services/returns.server");

    await approveRequest("shop.com", "token", "req-1");

    expect(sendNotification).toHaveBeenCalledWith(
      "shop.com", "return_approved", "req-1", expect.any(Object),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // C. Logistics configured, pickup fails (result.success = false)
  // ──────────────────────────────────────────────────────────────

  it("reverts to pending when pickup returns success:false", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "Pincode not serviceable" });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      "Pickup creation failed. Return moved back to Pending.",
    );

    // Status reverted to pending with approvedAt nulled
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reqId: "req-1" },
        data: expect.objectContaining({ status: "pending", approvedAt: null }),
      }),
    );
  });

  it("creates pickup_failed ReturnEvent on pickup result failure", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "Pincode not serviceable" });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: "shop.com",
        returnId: "db-id",
        type: "pickup_failed",
        actor: "system",
      }),
    });
  });

  it("logs audit on pickup result failure", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "Service unavailable" });
    const { auditLog } = await import("~/services/audit.server");
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(auditLog).toHaveBeenCalledWith(
      "shop.com", "order-1", "req-1", "pickup_failed", "system", expect.stringContaining("Service unavailable"),
    );
  });

  it("does NOT send notification when pickup fails", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "fail" });
    const { sendNotification } = await import("~/services/email-templates.server");
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // D. Logistics configured, pickup throws an exception
  // ──────────────────────────────────────────────────────────────

  it("reverts to pending when pickup throws an exception", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockRejectedValue(new Error("Network timeout"));
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      "Pickup creation failed. Return moved back to Pending.",
    );

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending", approvedAt: null }),
      }),
    );
  });

  it("creates pickup_failed event with exception message", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockRejectedValue(new Error("API rate limit"));
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "pickup_failed",
        message: "API rate limit",
        metadata: { error: "API rate limit" },
      }),
    });
  });

  it("does NOT send notification when pickup throws", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockRejectedValue(new Error("boom"));
    const { sendNotification } = await import("~/services/email-templates.server");
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // E. Exchange type — same pickup behavior
  // ──────────────────────────────────────────────────────────────

  it("reverts exchange request to pending on pickup failure", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({
      ...MOCK_RETURN, requestType: "exchange",
    });
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "fail" });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      "Pickup creation failed. Return moved back to Pending.",
    );

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) }),
    );
  });

  it("approves exchange normally when pickup succeeds", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({
      ...MOCK_RETURN, requestType: "exchange",
    });
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: true, awb: "AWB456" });
    const { sendNotification } = await import("~/services/email-templates.server");
    const { approveRequest } = await import("~/services/returns.server");

    await approveRequest("shop.com", "token", "req-1");

    expect(sendNotification).toHaveBeenCalledWith(
      "shop.com", "exchange_approved", "req-1", expect.any(Object),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // F. Mixed type
  // ──────────────────────────────────────────────────────────────

  it("reverts mixed request to pending on pickup failure", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({
      ...MOCK_RETURN, requestType: "mixed",
    });
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockRejectedValue(new Error("timeout"));
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow();

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "pickup_failed" }),
    });
  });

  // ──────────────────────────────────────────────────────────────
  // G. Error message content
  // ──────────────────────────────────────────────────────────────

  it("error message includes guidance about Settings", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "No warehouse" });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      /connect a logistics partner in Settings/,
    );
  });

  it("error message includes 'try again'", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false, error: "x" });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      /Please try again/,
    );
  });

  // ──────────────────────────────────────────────────────────────
  // H. Pickup failure with empty/undefined error
  // ──────────────────────────────────────────────────────────────

  it("handles pickup failure with no error message", async () => {
    getDefaultLogisticsForShop.mockResolvedValue({ adapter: {}, credentials: {}, config: {} });
    createPickupForReturn.mockResolvedValue({ success: false });
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "req-1")).rejects.toThrow(
      "Pickup creation failed. Return moved back to Pending.",
    );
  });

  // ──────────────────────────────────────────────────────────────
  // I. Request not found — still throws before pickup
  // ──────────────────────────────────────────────────────────────

  it("throws 'Request not found' before attempting pickup", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue(null);
    const { approveRequest } = await import("~/services/returns.server");

    await expect(approveRequest("shop.com", "token", "nonexistent")).rejects.toThrow("Request not found");

    expect(getDefaultLogisticsForShop).not.toHaveBeenCalled();
    expect(createPickupForReturn).not.toHaveBeenCalled();
  });
});
