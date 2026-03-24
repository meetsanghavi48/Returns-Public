import { describe, it, expect, vi, afterEach } from "vitest";
import { paymentRegistry } from "~/adapters/payments";
import { PaymentAdapter } from "~/adapters/payments/base";

const STUB_PAYMENT_KEYS = [
  "adyen",
  "cashgram",
  "transbnk",
  "shopflo",
  "nector",
  "easyrewardz",
  "gyftr",
  "flits",
  "credityard",
  "tap",
  "paypal",
  "klarna",
];

const REAL_PAYMENT_ADAPTERS: Record<string, string[]> = {
  razorpay: ["keyId", "keySecret"],
  cashfree: ["appId", "secretKey", "environment"],
  stripe: ["secretKey"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("real payment adapters have correct credentialFields", () => {
  for (const [key, expectedFields] of Object.entries(REAL_PAYMENT_ADAPTERS)) {
    it(`${key}: credentialFields include ${expectedFields.join(", ")}`, () => {
      const adapter = paymentRegistry.getAdapter(key);
      expect(adapter).toBeDefined();
      const fieldKeys = adapter!.credentialFields.map((f) => f.key);
      for (const field of expectedFields) {
        expect(fieldKeys).toContain(field);
      }
    });
  }
});

describe("stub payment adapters throw Not implemented", () => {
  for (const key of STUB_PAYMENT_KEYS) {
    it(`${key}: processRefund throws "Not implemented"`, () => {
      const adapter = paymentRegistry.getAdapter(key);
      expect(adapter).toBeDefined();
      expect(() =>
        adapter!.processRefund(
          {
            paymentId: "pay_test",
            amount: 100,
            currency: "INR",
            orderId: "order_test",
          },
          { apiKey: "fake" },
        ),
      ).toThrow("Not implemented");
    });
  }
});

describe("all payment adapters have required properties", () => {
  const adapters = paymentRegistry.list();

  for (const entry of adapters) {
    it(`${entry.key}: has key, displayName, logoUrl, credentialFields`, () => {
      const adapter = entry.adapter;
      expect(adapter).toBeInstanceOf(PaymentAdapter);
      expect(typeof adapter.key).toBe("string");
      expect(adapter.key.length).toBeGreaterThan(0);
      expect(typeof adapter.displayName).toBe("string");
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(typeof adapter.logoUrl).toBe("string");
      expect(adapter.logoUrl.length).toBeGreaterThan(0);
      expect(Array.isArray(adapter.credentialFields)).toBe(true);
      expect(adapter.credentialFields.length).toBeGreaterThan(0);
    });
  }
});

describe("Razorpay validateCredentials", () => {
  it("validates credentials with successful API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ valid: true }),
      text: () => Promise.resolve("ok"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({
      keyId: "rzp_test_123",
      keySecret: "secret_test_456",
    });
    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("returns invalid when API call fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({
      keyId: "rzp_test_bad",
      keySecret: "secret_bad",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid when credentials are missing", async () => {
    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({});
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Stripe validateCredentials", () => {
  it("validates credentials with successful API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ object: "balance" }),
      text: () => Promise.resolve("ok"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({
      secretKey: "sk_test_123",
    });
    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("returns invalid when API call fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({
      secretKey: "sk_test_bad",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid when credentials are missing", async () => {
    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({});
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Cashfree adapter headers", () => {
  it("sends correct headers (x-client-id, x-client-secret)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("ok"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("cashfree")!;
    await adapter.validateCredentials({
      appId: "test_app_id",
      secretKey: "test_secret",
      environment: "sandbox",
    });

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    const requestUrl = callArgs[0] as string;
    const requestInit = callArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(requestUrl).toContain("sandbox.cashfree.com");
    expect(headers["x-client-id"]).toBe("test_app_id");
    expect(headers["x-client-secret"]).toBe("test_secret");
  });
});
