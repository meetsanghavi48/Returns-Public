import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    settings: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    shop: { findUnique: vi.fn() },
  },
}));

describe("settings.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
  });

  describe("getSetting", () => {
    it("returns stored value", async () => {
      prisma.settings.findUnique.mockResolvedValue({ value: "custom_value" });
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "some_key");
      expect(result).toBe("custom_value");
    });

    it("returns default when no setting found", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "missing_key", "default_val");
      expect(result).toBe("default_val");
    });
  });

  describe("setSetting", () => {
    it("upserts a setting", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "test_key", true);
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { shop_key: { shop: "shop.com", key: "test_key" } },
        update: { value: true },
        create: { shop: "shop.com", key: "test_key", value: true },
      }));
    });
  });

  describe("getAllSettings", () => {
    it("returns flat object of settings", async () => {
      prisma.settings.findMany.mockResolvedValue([
        { key: "auto_approve", value: true },
        { key: "portal_color", value: "#C84B31" },
      ]);
      const { getAllSettings } = await import("~/services/settings.server");
      const result = await getAllSettings("shop.com");
      expect(result).toEqual({ auto_approve: true, portal_color: "#C84B31" });
    });

    it("returns empty object when no settings", async () => {
      prisma.settings.findMany.mockResolvedValue([]);
      const { getAllSettings } = await import("~/services/settings.server");
      const result = await getAllSettings("shop.com");
      expect(result).toEqual({});
    });
  });
});
