import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    returnRequest: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    returnCounter: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
    automationRule: { findMany: vi.fn() },
    automationLog: { create: vi.fn() },
    billingUsage: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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

describe("returns.server", () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    // Default mock returns
    prisma.returnCounter.upsert.mockResolvedValue({ lastNumber: 1 });
    prisma.returnRequest.create.mockResolvedValue({});
    prisma.returnRequest.findFirst.mockResolvedValue(null);
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.billingUsage.upsert.mockResolvedValue({});
    prisma.automationRule.findMany.mockResolvedValue([]);
  });

  describe("submitReturnRequest", () => {
    it("creates return with correct fields", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id", reqId: "mock-req-id" });
      const { submitReturnRequest } = await import("~/services/returns.server");

      const reqId = await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        orderNumber: "1001",
        customerName: "John",
        customerEmail: "john@e.com",
        items: [{ id: "li1", title: "Shirt", price: "500", qty: 1, action: "return", reason: "Size" }],
        refundMethod: "original",
      });

      expect(reqId).toBe("mock-req-id");
      expect(prisma.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          shop: "shop.com",
          reqId: "mock-req-id",
          orderId: "order-1",
          status: "pending",
          requestType: "return",
        }),
      }));
    });

    it("determines exchange type correctly", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });
      const { submitReturnRequest } = await import("~/services/returns.server");

      await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        items: [{ id: "li1", title: "Shirt", price: "500", qty: 1, action: "exchange" }],
      });

      expect(prisma.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ requestType: "exchange" }),
      }));
    });

    it("determines mixed type when both return and exchange items", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });
      const { submitReturnRequest } = await import("~/services/returns.server");

      await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        items: [
          { id: "li1", title: "Shirt", price: "500", qty: 1, action: "return" },
          { id: "li2", title: "Pants", price: "800", qty: 1, action: "exchange" },
        ],
      });

      expect(prisma.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ requestType: "mixed" }),
      }));
    });

    it("increments billing usage", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });
      const { submitReturnRequest } = await import("~/services/returns.server");

      await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        items: [{ id: "li1", title: "Shirt", price: "500", qty: 1, action: "return" }],
      });

      expect(prisma.billingUsage.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { shop: "shop.com" },
        update: { requestsUsed: { increment: 1 } },
      }));
    });

    it("sends notification on create", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id" });
      const { sendNotification } = await import("~/services/email-templates.server");
      const { submitReturnRequest } = await import("~/services/returns.server");

      await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        customerEmail: "test@e.com",
        items: [{ id: "li1", title: "Shirt", price: "500", qty: 1, action: "return" }],
      });

      expect(sendNotification).toHaveBeenCalledWith(
        "shop.com", "return_raised", "mock-req-id", expect.objectContaining({ customer_email: "test@e.com" }),
      );
    });

    it("auto-approves when setting is true", async () => {
      prisma.settings.findUnique.mockResolvedValue({ value: true });
      prisma.returnRequest.update.mockResolvedValue({});
      prisma.returnRequest.findFirst.mockResolvedValue({ id: "db-id", reqId: "mock-req-id" });
      const { submitReturnRequest } = await import("~/services/returns.server");

      await submitReturnRequest("shop.com", "token", {
        orderId: "order-1",
        items: [{ id: "li1", title: "Shirt", price: "500", qty: 1, action: "return" }],
      });

      // Auto-approve updates status
      expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "approved" }),
      }));
    });
  });

  describe("approveRequest", () => {
    it("updates status to approved", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "db-id", reqId: "req-1", orderId: "order-1", shop: "shop.com", requestType: "return",
        customerName: "John", customerEmail: "john@e.com", orderNumber: "1001", awb: null,
      });
      prisma.returnRequest.update.mockResolvedValue({});
      const { approveRequest } = await import("~/services/returns.server");

      await approveRequest("shop.com", "token", "req-1");

      expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "approved" }),
      }));
    });

    it("sends approval notification", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "db-id", reqId: "req-1", orderId: "order-1", shop: "shop.com", requestType: "return",
        customerName: "John", customerEmail: "john@e.com", orderNumber: "1001", awb: null,
      });
      prisma.returnRequest.update.mockResolvedValue({});
      const { sendNotification } = await import("~/services/email-templates.server");
      const { approveRequest } = await import("~/services/returns.server");

      await approveRequest("shop.com", "token", "req-1");

      expect(sendNotification).toHaveBeenCalledWith(
        "shop.com", "return_approved", "req-1", expect.any(Object),
      );
    });

    it("throws when request not found", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      const { approveRequest } = await import("~/services/returns.server");
      await expect(approveRequest("shop.com", "token", "nonexistent")).rejects.toThrow("Request not found");
    });
  });

  describe("rejectRequest", () => {
    it("updates status to rejected with reason", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "db-id", reqId: "req-1", orderId: "order-1", shop: "shop.com", requestType: "return",
        customerName: "John", customerEmail: "john@e.com", orderNumber: "1001",
      });
      prisma.returnRequest.update.mockResolvedValue({});
      prisma.returnRequest.findUnique.mockResolvedValue(null);
      const { rejectRequest } = await import("~/services/returns.server");

      await rejectRequest("shop.com", "token", "req-1", "Item damaged");

      expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" }),
      }));
    });

    it("sends rejection notification", async () => {
      prisma.returnRequest.findFirst.mockResolvedValue({
        id: "db-id", reqId: "req-1", orderId: "order-1", shop: "shop.com", requestType: "return",
        customerName: "John", customerEmail: "john@e.com", orderNumber: "1001",
      });
      prisma.returnRequest.update.mockResolvedValue({});
      prisma.returnRequest.findUnique.mockResolvedValue(null);
      const { sendNotification } = await import("~/services/email-templates.server");
      const { rejectRequest } = await import("~/services/returns.server");

      await rejectRequest("shop.com", "token", "req-1", "Policy violation");

      expect(sendNotification).toHaveBeenCalledWith(
        "shop.com", "return_rejected", "req-1",
        expect.objectContaining({ rejection_reason: "Policy violation" }),
      );
    });
  });

  describe("archiveRequest", () => {
    it("sets status to archived", async () => {
      prisma.returnRequest.update.mockResolvedValue({});
      prisma.returnRequest.findUnique.mockResolvedValue({ orderId: "ord-1" });
      const { archiveRequest } = await import("~/services/returns.server");

      await archiveRequest("shop.com", "req-1");

      expect(prisma.returnRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "archived" }),
      }));
    });
  });
});
