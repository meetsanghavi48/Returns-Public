import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    settings: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  },
}));

describe("settings.server — nudges, fees, tax", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
  });

  describe("getSetting", () => {
    it("returns default value when setting not found", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const val = await getSetting("shop.com", "nudge_exchange_enabled", true);
      expect(val).toBe(true);
    });

    it("returns stored value when setting exists", async () => {
      prisma.settings.findUnique.mockResolvedValue({ value: false });
      const { getSetting } = await import("~/services/settings.server");
      const val = await getSetting("shop.com", "nudge_exchange_enabled", true);
      expect(val).toBe(false);
    });

    it("returns numeric default for nudge_exchange_bonus", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const val = await getSetting("shop.com", "nudge_exchange_bonus", 0);
      expect(val).toBe(0);
    });

    it("returns stored numeric value for tax_rate_pct", async () => {
      prisma.settings.findUnique.mockResolvedValue({ value: 18 });
      const { getSetting } = await import("~/services/settings.server");
      const val = await getSetting("shop.com", "tax_rate_pct", 0);
      expect(val).toBe(18);
    });

    it("returns stored string for nudge_exchange_message", async () => {
      prisma.settings.findUnique.mockResolvedValue({ value: "Get 50 bonus!" });
      const { getSetting } = await import("~/services/settings.server");
      const val = await getSetting("shop.com", "nudge_exchange_message", "");
      expect(val).toBe("Get 50 bonus!");
    });
  });

  describe("setSetting", () => {
    it("upserts boolean setting", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "nudge_store_credit_enabled", true);
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { shop_key: { shop: "shop.com", key: "nudge_store_credit_enabled" } },
        update: { value: true },
        create: { shop: "shop.com", key: "nudge_store_credit_enabled", value: true },
      }));
    });

    it("upserts numeric setting for exchange_shipping_fee", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "exchange_shipping_fee", 50);
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: { value: 50 },
      }));
    });
  });

  describe("getAllSettings", () => {
    it("returns flat object of all settings", async () => {
      prisma.settings.findMany.mockResolvedValue([
        { key: "return_window_days", value: 30 },
        { key: "tax_rate_pct", value: 18 },
        { key: "nudge_exchange_enabled", value: true },
        { key: "nudge_store_credit_bonus", value: 50 },
        { key: "return_shipping_fee", value: 100 },
        { key: "exchange_shipping_fee", value: 0 },
        { key: "restocking_fee_pct", value: 5 },
      ]);
      const { getAllSettings } = await import("~/services/settings.server");
      const s = await getAllSettings("shop.com");
      expect(s.return_window_days).toBe(30);
      expect(s.tax_rate_pct).toBe(18);
      expect(s.nudge_exchange_enabled).toBe(true);
      expect(s.nudge_store_credit_bonus).toBe(50);
      expect(s.return_shipping_fee).toBe(100);
      expect(s.exchange_shipping_fee).toBe(0);
      expect(s.restocking_fee_pct).toBe(5);
    });
  });
});
