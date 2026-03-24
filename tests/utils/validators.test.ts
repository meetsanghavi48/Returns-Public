import { describe, it, expect } from "vitest";
import {
  ReturnRequestSchema,
  LogisticsCredentialsSchema,
  PaymentCredentialsSchema,
  WmsCredentialsSchema,
} from "~/utils/validators";

describe("ReturnRequestSchema", () => {
  it("validates a minimal valid return request", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [
        {
          lineItemId: "li1",
          title: "T-Shirt",
          quantity: 1,
          price: 29.99,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates a full return request with all fields", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      orderNumber: "#1001",
      customerName: "John Doe",
      customerEmail: "john@example.com",
      items: [
        {
          lineItemId: "li1",
          title: "T-Shirt",
          variantTitle: "Medium / Blue",
          sku: "TSH-M-BLU",
          quantity: 2,
          price: 29.99,
          reason: "Size issue",
          reasonNote: "Too small",
          action: "return",
        },
      ],
      refundMethod: "original",
      requestType: "return",
      address: {
        name: "John Doe",
        address1: "123 Main St",
        city: "Delhi",
        state: "DL",
        zip: "110001",
        country: "India",
        phone: "9876543210",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty orderId", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty items array (no minLength constraint)", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [],
    });
    // The schema has no .min(1) on items array, so empty array is valid
    expect(result.success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: -1, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 0, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1.5, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      customerEmail: "not-an-email",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid refund method", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      refundMethod: "bitcoin",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid request type", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      requestType: "invalid",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid photoUrl", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10, photoUrl: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid action enum values", () => {
    const returnResult = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10, action: "return" }],
    });
    expect(returnResult.success).toBe(true);

    const exchangeResult = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10, action: "exchange" }],
    });
    expect(exchangeResult.success).toBe(true);
  });

  it("rejects invalid action value", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10, action: "refund" }],
    });
    expect(result.success).toBe(false);
  });

  it("applies default values for action and requestType", () => {
    const result = ReturnRequestSchema.safeParse({
      orderId: "order123",
      items: [{ lineItemId: "li1", title: "T", quantity: 1, price: 10 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].action).toBe("return");
      expect(result.data.requestType).toBe("return");
    }
  });
});

describe("LogisticsCredentialsSchema", () => {
  it("validates valid logistics credentials", () => {
    const result = LogisticsCredentialsSchema.safeParse({
      providerKey: "delhivery",
      credentials: { token: "abc123" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty providerKey", () => {
    const result = LogisticsCredentialsSchema.safeParse({
      providerKey: "",
      credentials: { token: "abc" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing credentials", () => {
    const result = LogisticsCredentialsSchema.safeParse({
      providerKey: "delhivery",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional isDefault field", () => {
    const result = LogisticsCredentialsSchema.safeParse({
      providerKey: "delhivery",
      credentials: { token: "abc123" },
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("PaymentCredentialsSchema", () => {
  it("validates valid payment credentials", () => {
    const result = PaymentCredentialsSchema.safeParse({
      providerKey: "razorpay",
      credentials: { keyId: "rzp_test_xxx", keySecret: "secret" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty providerKey", () => {
    const result = PaymentCredentialsSchema.safeParse({
      providerKey: "",
      credentials: { keyId: "rzp_test_xxx" },
    });
    expect(result.success).toBe(false);
  });
});

describe("WmsCredentialsSchema", () => {
  it("validates valid WMS credentials", () => {
    const result = WmsCredentialsSchema.safeParse({
      providerKey: "unicommerce",
      credentials: { username: "user", password: "pass", tenantId: "t1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing providerKey", () => {
    const result = WmsCredentialsSchema.safeParse({
      credentials: { username: "user" },
    });
    expect(result.success).toBe(false);
  });
});
