import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    emailNotification: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    emailLog: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));

vi.mock("~/shopify.server", () => ({ default: {} }));
vi.mock("~/services/shopify.server", () => ({ shopifyREST: vi.fn(), updateOrderTags: vi.fn(), uid: vi.fn(() => "uid") }));

describe("email-templates.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("SENDGRID_API_KEY", "");
    prisma = (await import("~/db.server")).default;
  });

  describe("seedNotificationTemplates", () => {
    it("creates templates for new shop (count=0)", async () => {
      prisma.emailNotification.count.mockResolvedValue(0);
      prisma.emailNotification.create.mockResolvedValue({});

      const { seedNotificationTemplates } = await import("~/services/email-templates.server");
      await seedNotificationTemplates("test.myshopify.com");

      expect(prisma.emailNotification.create).toHaveBeenCalled();
      const calls = prisma.emailNotification.create.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(11);
    });

    it("skips if templates already exist", async () => {
      prisma.emailNotification.count.mockResolvedValue(15);

      const { seedNotificationTemplates } = await import("~/services/email-templates.server");
      await seedNotificationTemplates("test.myshopify.com");

      expect(prisma.emailNotification.create).not.toHaveBeenCalled();
    });
  });

  describe("sendNotification", () => {
    it("skips if template not found", async () => {
      prisma.emailNotification.findUnique.mockResolvedValue(null);

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", { customer_email: "t@e.com" });

      expect(prisma.emailLog.create).not.toHaveBeenCalled();
    });

    it("skips if template is disabled", async () => {
      prisma.emailNotification.findUnique.mockResolvedValue({ isEnabled: false, subject: "s", htmlBody: "b" });

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", { customer_email: "t@e.com" });

      expect(prisma.emailLog.create).not.toHaveBeenCalled();
    });

    it("skips if no customer_email", async () => {
      prisma.emailNotification.findUnique.mockResolvedValue({ isEnabled: true, subject: "s", htmlBody: "b" });

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", {});

      expect(prisma.emailLog.create).not.toHaveBeenCalled();
    });

    it("replaces {{variables}} in subject and body", async () => {
      prisma.emailNotification.findUnique.mockResolvedValue({
        isEnabled: true,
        subject: "Return #{{request_id}} for {{customer_name}}",
        htmlBody: "<p>Hi {{customer_name}}, order {{order_number}}</p>",
        senderEmail: null,
      });
      prisma.settings.findUnique.mockResolvedValue(null);
      prisma.emailLog.create.mockResolvedValue({});

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", {
        customer_email: "john@e.com",
        customer_name: "John",
        request_id: "RET-001",
        order_number: "#1001",
      });

      // Should log with substituted subject
      expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          subject: "Return #RET-001 for John",
          status: "skipped", // no SENDGRID_API_KEY
        }),
      }));
    });

    it("logs as skipped when SENDGRID_API_KEY not set", async () => {
      prisma.emailNotification.findUnique.mockResolvedValue({
        isEnabled: true, subject: "Test", htmlBody: "<p>Hi</p>", senderEmail: null,
      });
      prisma.settings.findUnique.mockResolvedValue(null);
      prisma.emailLog.create.mockResolvedValue({});

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", { customer_email: "t@e.com" });

      expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "skipped" }),
      }));
    });

    it("calls SendGrid when API key is set", async () => {
      vi.stubEnv("SENDGRID_API_KEY", "SG.test_key");
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      prisma.emailNotification.findUnique.mockResolvedValue({
        isEnabled: true, subject: "Test", htmlBody: "<p>Hi</p>", senderEmail: null,
      });
      prisma.settings.findUnique.mockResolvedValue(null);
      prisma.emailLog.create.mockResolvedValue({});

      const { sendNotification } = await import("~/services/email-templates.server");
      await sendNotification("shop", "return_raised", "ret1", { customer_email: "t@e.com" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/mail/send",
        expect.objectContaining({ method: "POST" }),
      );
      expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "sent" }),
      }));

      vi.unstubAllGlobals();
    });
  });

  describe("getDefaultTemplate", () => {
    it("returns template for known event key", async () => {
      const { getDefaultTemplate } = await import("~/services/email-templates.server");
      const t = getDefaultTemplate("return_raised");
      expect(t.subject).toContain("{{request_id}}");
      expect(t.htmlBody).toContain("{{customer_name}}");
    });

    it("returns empty for unknown key", async () => {
      const { getDefaultTemplate } = await import("~/services/email-templates.server");
      const t = getDefaultTemplate("nonexistent_event");
      expect(t.subject).toBe("");
      expect(t.htmlBody).toBe("");
    });
  });
});
