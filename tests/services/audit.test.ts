import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: { auditLog: { create: vi.fn() } },
}));

describe("audit.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.auditLog.create.mockResolvedValue({});
  });

  it("creates audit log entry with all fields", async () => {
    const { auditLog } = await import("~/services/audit.server");
    await auditLog("shop.com", "order-1", "req-1", "approved", "admin", "Manual approval");

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        shop: "shop.com",
        orderId: "order-1",
        reqId: "req-1",
        action: "approved",
        actor: "admin",
        details: "Manual approval",
      },
    });
  });

  it("handles missing optional fields", async () => {
    const { auditLog } = await import("~/services/audit.server");
    await auditLog("shop.com", undefined, undefined, "system_event", undefined, undefined);

    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
