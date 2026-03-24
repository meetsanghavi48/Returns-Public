import { describe, it, expect } from "vitest";
import { paymentRegistry } from "~/adapters/payments";
import { PaymentAdapter } from "~/adapters/payments/base";

describe("paymentRegistry", () => {
  it("has all expected adapters registered (>= 18)", () => {
    const adapters = paymentRegistry.list();
    expect(adapters.length).toBeGreaterThanOrEqual(18);
  });

  it("get() returns correct adapter entry by key", () => {
    const entry = paymentRegistry.get("razorpay");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("razorpay");
    expect(entry!.displayName).toBe("Razorpay");
  });

  it("getAdapter() returns an instance of PaymentAdapter", () => {
    const adapter = paymentRegistry.getAdapter("razorpay");
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(PaymentAdapter);
  });

  it("list() returns all registered adapters", () => {
    const adapters = paymentRegistry.list();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters.length).toBeGreaterThan(0);

    const keys = adapters.map((a) => a.key);
    expect(keys).toContain("razorpay");
    expect(keys).toContain("stripe");
    expect(keys).toContain("cashfree");
  });

  it("Razorpay adapter has correct credentialFields (keyId, keySecret)", () => {
    const entry = paymentRegistry.get("razorpay");
    expect(entry).toBeDefined();
    const fieldKeys = entry!.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("keyId");
    expect(fieldKeys).toContain("keySecret");
  });

  it("Stripe adapter has correct credentialFields (secretKey)", () => {
    const entry = paymentRegistry.get("stripe");
    expect(entry).toBeDefined();
    const fieldKeys = entry!.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("secretKey");
  });

  it("get() with unknown key returns undefined", () => {
    const entry = paymentRegistry.get("nonexistent_payment_xyz");
    expect(entry).toBeUndefined();
  });
});
