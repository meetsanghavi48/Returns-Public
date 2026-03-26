import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before imports
vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    returnEvent: { create: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    shop: { findUnique: vi.fn() },
  },
}));

vi.mock("~/services/admin-session.server", () => ({
  requireAdminAuth: vi.fn().mockResolvedValue({ shop: "shop.com", accessToken: "token" }),
}));

vi.mock("~/services/returns.server", () => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  archiveRequest: vi.fn(),
}));

vi.mock("~/services/refunds.server", () => ({
  processRefund: vi.fn(),
}));

vi.mock("~/services/exchanges.server", () => ({
  createExchangeOrder: vi.fn(),
}));

vi.mock("~/services/delhivery.server", () => ({
  createDelhiveryPickup: vi.fn(),
}));

vi.mock("~/services/audit.server", () => ({
  auditLog: vi.fn(),
}));

vi.mock("~/services/shopify.server", () => ({
  shopifyREST: vi.fn(),
}));

vi.mock("~/services/settings.server", () => ({
  getSetting: vi.fn().mockResolvedValue(100),
}));

const MOCK_RETURN = {
  id: "db-id",
  reqId: "req-1",
  orderId: "order-1",
  shop: "shop.com",
  status: "approved",
  requestType: "return",
  customerName: "John",
  customerEmail: "john@e.com",
  orderNumber: "1001",
  awb: null,
  trackingUrl: null,
  carrierName: null,
  items: [],
  address: {},
  createdAt: new Date().toISOString(),
};

function buildFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

function buildRequest(formData: FormData): Request {
  return new Request("http://localhost/admin/return/req-1", {
    method: "POST",
    body: formData,
  });
}

describe("admin.return.$reqId — self_ship action", () => {
  let prisma: any;
  let action: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.returnRequest.findFirst.mockResolvedValue({ ...MOCK_RETURN });
    prisma.returnRequest.update.mockResolvedValue({});
    prisma.returnEvent.create.mockResolvedValue({});
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue(null);

    const route = await import("~/routes/admin.return.$reqId");
    action = route.action;
  });

  // ──────────────────────────────────────────────────────────────
  // A. Successful self-ship with tracking URL + carrier
  // ──────────────────────────────────────────────────────────────

  it("saves self-ship with trackingUrl and carrierName", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://tracking.example.com/ABC123",
      carrierName: "India Post",
    });

    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.message).toContain("Self-ship tracking saved");
    expect(data.message).toContain("In Transit");
  });

  it("updates ReturnRequest with correct fields", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/123",
      carrierName: "DTDC",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { reqId: "req-1", shop: "shop.com" },
      data: {
        trackingUrl: "https://track.me/123",
        carrierName: "DTDC",
        awb: "SELF-SHIP",
        awbStatus: "Self Ship",
        status: "in_transit",
      },
    });
  });

  it("creates self_ship_added ReturnEvent", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/456",
      carrierName: "BlueDart",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: "shop.com",
        returnId: "db-id",
        type: "self_ship_added",
        status: "in_transit",
        actor: "admin",
      }),
    });
  });

  it("logs audit entry for self-ship", async () => {
    const { auditLog } = await import("~/services/audit.server");

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/789",
      carrierName: "",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(auditLog).toHaveBeenCalledWith(
      "shop.com", null, "req-1", "self_ship_added", "admin",
      expect.stringContaining("https://track.me/789"),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // B. Self-ship with tracking URL only (no carrier)
  // ──────────────────────────────────────────────────────────────

  it("saves self-ship without carrier name", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://tracking.example.com/XYZ",
    });

    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(data.ok).toBe(true);
  });

  it("sets carrierName to null when empty", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://tracking.example.com/XYZ",
      carrierName: "",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ carrierName: null }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // C. Self-ship without tracking URL — should fail
  // ──────────────────────────────────────────────────────────────

  it("returns error when trackingUrl is missing", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      carrierName: "India Post",
    });

    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Tracking link is required");
  });

  it("returns error when trackingUrl is empty string", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "",
      carrierName: "India Post",
    });

    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Tracking link is required");
  });

  it("does NOT update DB when trackingUrl missing", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).not.toHaveBeenCalled();
    expect(prisma.returnEvent.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // D. Self-ship sets AWB to "SELF-SHIP" string
  // ──────────────────────────────────────────────────────────────

  it("sets awb field to exact string SELF-SHIP", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/test",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ awb: "SELF-SHIP" }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // E. Self-ship sets status to in_transit
  // ──────────────────────────────────────────────────────────────

  it("sets status to in_transit", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/test",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "in_transit" }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // F. ReturnEvent metadata includes trackingUrl and carrierName
  // ──────────────────────────────────────────────────────────────

  it("includes tracking details in event metadata", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/meta",
      carrierName: "FedEx",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { trackingUrl: "https://track.me/meta", carrierName: "FedEx" },
      }),
    });
  });

  // ──────────────────────────────────────────────────────────────
  // G. Self-ship event message includes carrier
  // ──────────────────────────────────────────────────────────────

  it("event message includes carrier name", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/test",
      carrierName: "India Post",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: expect.stringContaining("India Post"),
      }),
    });
  });

  it("event message shows N/A when no carrier", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/test",
      carrierName: "",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: expect.stringContaining("N/A"),
      }),
    });
  });

  // ──────────────────────────────────────────────────────────────
  // H. Update tracking (re-submit self_ship on existing self-ship)
  // ──────────────────────────────────────────────────────────────

  it("updates tracking URL on existing self-ship return", async () => {
    prisma.returnRequest.findFirst.mockResolvedValue({
      ...MOCK_RETURN,
      awb: "SELF-SHIP",
      trackingUrl: "https://old-tracking.com",
      carrierName: "India Post",
      status: "in_transit",
    });

    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://new-tracking.com/updated",
      carrierName: "BlueDart",
    });

    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackingUrl: "https://new-tracking.com/updated",
          carrierName: "BlueDart",
        }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // I. awbStatus set to "Self Ship"
  // ──────────────────────────────────────────────────────────────

  it("sets awbStatus to Self Ship", async () => {
    const fd = buildFormData({
      intent: "self_ship",
      trackingUrl: "https://track.me/test",
    });

    await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });

    expect(prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ awbStatus: "Self Ship" }),
      }),
    );
  });
});

describe("admin.return.$reqId — approve action with pickup failure", () => {
  let action: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prisma = (await import("~/db.server")).default;
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue(null);

    const route = await import("~/routes/admin.return.$reqId");
    action = route.action;
  });

  it("returns error message from approveRequest failure", async () => {
    const { approveRequest } = await import("~/services/returns.server");
    (approveRequest as any).mockRejectedValue(
      new Error("Pickup creation failed. Return moved back to Pending. Please try again or connect a logistics partner in Settings."),
    );

    const fd = buildFormData({ intent: "approve" });
    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Pickup creation failed");
    expect(data.error).toContain("Pending");
  });

  it("returns success when approve succeeds", async () => {
    const { approveRequest } = await import("~/services/returns.server");
    (approveRequest as any).mockResolvedValue(undefined);

    const fd = buildFormData({ intent: "approve" });
    const response = await action({
      request: buildRequest(fd),
      params: { reqId: "req-1" },
      context: {},
    });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.message).toBe("Request approved");
  });
});
