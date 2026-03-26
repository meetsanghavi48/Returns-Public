import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    shop: { findUnique: vi.fn() },
  },
}));

describe("admin-session.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
  });

  describe("hasPermission", () => {
    it("returns true for owner regardless of permissions", async () => {
      const { hasPermission } = await import("~/services/admin-session.server");
      const user = { role: "owner", permissions: {} };
      expect(hasPermission(user, "settings", "general")).toBe(true);
      expect(hasPermission(user, "request", "delete")).toBe(true);
      expect(hasPermission(user, "analytics", "view")).toBe(true);
    });

    it("returns true when user has the specific permission", async () => {
      const { hasPermission } = await import("~/services/admin-session.server");
      const user = {
        role: "staff",
        permissions: {
          home: ["view"],
          request: ["view", "create", "approve"],
          analytics: ["view"],
        },
      };
      expect(hasPermission(user, "home", "view")).toBe(true);
      expect(hasPermission(user, "request", "approve")).toBe(true);
      expect(hasPermission(user, "analytics", "view")).toBe(true);
    });

    it("returns false when user lacks the permission", async () => {
      const { hasPermission } = await import("~/services/admin-session.server");
      const user = {
        role: "viewer",
        permissions: {
          home: ["view"],
          request: ["view"],
        },
      };
      expect(hasPermission(user, "request", "delete")).toBe(false);
      expect(hasPermission(user, "settings", "general")).toBe(false);
      expect(hasPermission(user, "export", "download")).toBe(false);
    });

    it("returns false when permissions object is empty", async () => {
      const { hasPermission } = await import("~/services/admin-session.server");
      const user = { role: "staff", permissions: {} };
      expect(hasPermission(user, "home", "view")).toBe(false);
    });

    it("returns false when user is null", async () => {
      const { hasPermission } = await import("~/services/admin-session.server");
      expect(hasPermission(null, "home", "view")).toBe(false);
    });
  });
});
