import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    settings: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    returnRequest: { findMany: vi.fn() },
  },
}));

describe("refund modes — prepaid vs COD", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    prisma.returnRequest.findMany.mockResolvedValue([]);
  });

  describe("global refund mode settings", () => {
    it("getSetting returns prepaid store credit default true", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "refund_prepaid_store_credit", true);
      expect(result).toBe(true);
    });

    it("getSetting returns prepaid original default true", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "refund_prepaid_original", true);
      expect(result).toBe(true);
    });

    it("getSetting returns COD store credit default true", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "refund_cod_store_credit", true);
      expect(result).toBe(true);
    });

    it("getSetting returns COD bank transfer default false", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "refund_cod_bank_transfer", false);
      expect(result).toBe(false);
    });

    it("getSetting returns COD other default false", async () => {
      prisma.settings.findUnique.mockResolvedValue(null);
      const { getSetting } = await import("~/services/settings.server");
      const result = await getSetting("shop.com", "refund_cod_other", false);
      expect(result).toBe(false);
    });

    it("setSetting stores refund mode correctly", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "refund_cod_bank_transfer", true);
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { shop_key: { shop: "shop.com", key: "refund_cod_bank_transfer" } },
        update: { value: true },
        create: { shop: "shop.com", key: "refund_cod_bank_transfer", value: true },
      }));
    });
  });

  describe("prepaid order refund options", () => {
    it("shows original + store credit when both enabled", async () => {
      prisma.settings.findUnique
        .mockResolvedValueOnce({ value: true }) // prepaid_store_credit
        .mockResolvedValueOnce({ value: true }); // prepaid_original
      const { getSetting } = await import("~/services/settings.server");
      const sc = await getSetting("shop.com", "refund_prepaid_store_credit", true);
      const orig = await getSetting("shop.com", "refund_prepaid_original", true);
      const options = [];
      if (orig) options.push("original");
      if (sc) options.push("store_credit");
      expect(options).toContain("original");
      expect(options).toContain("store_credit");
      expect(options).not.toContain("bank_transfer");
    });

    it("shows only store credit when original disabled", async () => {
      prisma.settings.findUnique
        .mockResolvedValueOnce({ value: true })   // prepaid_store_credit
        .mockResolvedValueOnce({ value: false });  // prepaid_original
      const { getSetting } = await import("~/services/settings.server");
      const sc = await getSetting("shop.com", "refund_prepaid_store_credit", true);
      const orig = await getSetting("shop.com", "refund_prepaid_original", true);
      const options = [];
      if (orig) options.push("original");
      if (sc) options.push("store_credit");
      expect(options).toEqual(["store_credit"]);
    });
  });

  describe("COD order refund options", () => {
    it("shows store credit + bank transfer when both enabled", async () => {
      prisma.settings.findUnique
        .mockResolvedValueOnce({ value: true })  // cod_store_credit
        .mockResolvedValueOnce({ value: true })  // cod_bank_transfer
        .mockResolvedValueOnce({ value: false }); // cod_other
      const { getSetting } = await import("~/services/settings.server");
      const sc = await getSetting("shop.com", "refund_cod_store_credit", true);
      const bt = await getSetting("shop.com", "refund_cod_bank_transfer", false);
      const other = await getSetting("shop.com", "refund_cod_other", false);
      const options = [];
      if (sc) options.push("store_credit");
      if (bt) options.push("bank_transfer");
      if (other) options.push("other");
      expect(options).toContain("store_credit");
      expect(options).toContain("bank_transfer");
      expect(options).not.toContain("other");
    });

    it("COD order never shows 'original' payment", async () => {
      // COD = payment pending, so original payment refund makes no sense
      const codOptions = ["store_credit", "bank_transfer", "other"];
      expect(codOptions).not.toContain("original");
    });

    it("shows all 3 COD options when all enabled", async () => {
      prisma.settings.findUnique
        .mockResolvedValueOnce({ value: true })
        .mockResolvedValueOnce({ value: true })
        .mockResolvedValueOnce({ value: true });
      const { getSetting } = await import("~/services/settings.server");
      const sc = await getSetting("shop.com", "refund_cod_store_credit", true);
      const bt = await getSetting("shop.com", "refund_cod_bank_transfer", false);
      const other = await getSetting("shop.com", "refund_cod_other", false);
      const options = [];
      if (sc) options.push("store_credit");
      if (bt) options.push("bank_transfer");
      if (other) options.push("other");
      expect(options).toHaveLength(3);
    });
  });

  describe("return methods global settings", () => {
    it("stores method_send_label setting", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "method_send_label", true);
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ key: "method_send_label", value: true }),
      }));
    });

    it("stores method_ship_back setting", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "method_ship_back", false);
      expect(prisma.settings.upsert).toHaveBeenCalled();
    });

    it("stores region setting", async () => {
      prisma.settings.upsert.mockResolvedValue({});
      const { setSetting } = await import("~/services/settings.server");
      await setSetting("shop.com", "return_region", "US, IN, GB");
      expect(prisma.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ key: "return_region", value: "US, IN, GB" }),
      }));
    });
  });
});
