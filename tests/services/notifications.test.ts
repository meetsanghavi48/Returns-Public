import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("~/db.server", () => ({
  default: {
    returnRequest: {
      findFirst: vi.fn(),
    },
    settings: {
      findFirst: vi.fn(),
    },
  },
}));

describe("notifications.server", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips email when SENDGRID_API_KEY is not set", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    const { sendReturnConfirmation } = await import("~/services/notifications.server");
    // Should not throw, just skip
    await sendReturnConfirmation("ret-1", "test.myshopify.com");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends email when SENDGRID_API_KEY is set", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    const prisma = (await import("~/db.server")).default;
    (prisma.returnRequest.findFirst as any).mockResolvedValue({
      id: "ret-1",
      reqId: "REQ-001",
      reqNum: 1,
      customerEmail: "customer@test.com",
      customerName: "Test User",
      orderId: "order-1",
      orderNumber: "#1001",
      requestType: "return",
      items: [{ title: "T-Shirt", quantity: 1, reason: "Size issue" }],
      awb: null,
    });
    (prisma.settings.findFirst as any).mockResolvedValue({
      value: { value: "TestBrand" },
    });

    const { sendReturnConfirmation } = await import("~/services/notifications.server");
    await sendReturnConfirmation("ret-1", "test.myshopify.com");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer SG.test-key",
        }),
      })
    );
  });
});
