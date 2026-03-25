import { describe, it, expect, vi, afterEach } from "vitest";
import { paymentRegistry } from "~/adapters/payments";
import { PaymentAdapter } from "~/adapters/payments/base";

// These are truly unimplemented stubs
const STUB_PAYMENT_KEYS = ["paypal", "klarna"];

// These now have real or partial implementations (return errors, not throw)
const UPGRADED_PAYMENT_KEYS = [
  "adyen", "tap", "yotpo", "cashgram", "nector", "nector_loyalty_wallet",
  "flits", "credityard", "gyftr", "easyrewardz", "transbnk", "shopflo",
];

const REAL_PAYMENT_ADAPTERS: Record<string, string[]> = {
  razorpay: ["keyId", "keySecret"],
  cashfree: ["appId", "secretKey", "environment"],
  stripe: ["secretKey"],
  adyen: ["api_key", "merchant_account", "environment"],
  tap: ["secret_key"],
  yotpo: ["api_key", "guid"],
  cashgram: ["client_id", "client_secret", "environment"],
};

afterEach(() => {
  vi.unstubAllGlobals();
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
          { paymentId: "pay_test", amount: 100, currency: "INR", orderId: "order_test" },
          { apiKey: "fake" },
        ),
      ).toThrow("Not implemented");
    });
  }
});

describe("upgraded adapters return error results instead of throwing", () => {
  for (const key of UPGRADED_PAYMENT_KEYS) {
    it(`${key}: processRefund returns a result (not throw)`, async () => {
      const adapter = paymentRegistry.getAdapter(key);
      expect(adapter).toBeDefined();

      // Mock fetch for adapters that make network calls
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 400, json: () => Promise.resolve({ message: "test" }),
      }));

      const result = await adapter!.processRefund(
        { paymentId: "pay_test", amount: 100, currency: "INR", orderId: "order_test" },
        { apiKey: "fake", api_key: "fake", secret_key: "fake", client_id: "fake", client_secret: "fake", environment: "test" },
      );
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("status");
    });
  }
});

describe("Adyen adapter", () => {
  it("processRefund sends correct headers and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pspReference: "ref123", status: "received" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("adyen")!;
    const result = await adapter.processRefund(
      { paymentId: "PSP123", amount: 50, currency: "EUR", orderId: "ord1" },
      { api_key: "test_key", merchant_account: "TestMerchant", environment: "test" },
    );

    expect(result.success).toBe(true);
    expect(result.refundId).toBe("ref123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://checkout-test.adyen.com/v71/payments/PSP123/refunds",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "test_key" }),
      }),
    );
  });

  it("uses live URL in production", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ pspReference: "ref456", status: "received" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("adyen")!;
    await adapter.processRefund(
      { paymentId: "PSP456", amount: 100, currency: "EUR", orderId: "ord2" },
      { api_key: "live_key", merchant_account: "LiveMerchant", environment: "live" },
    );

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("checkout-live.adyen.com");
  });

  it("validateCredentials calls management API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("adyen")!;
    const result = await adapter.validateCredentials({
      api_key: "test_key", merchant_account: "TestMerchant", environment: "test",
    });
    expect(result.valid).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toContain("management-test.adyen.com");
  });
});

describe("Tap adapter", () => {
  it("processRefund sends Bearer auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "ref_tap_1", status: "CAPTURED", amount: 100 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("tap")!;
    const result = await adapter.processRefund(
      { paymentId: "chg_123", amount: 100, currency: "KWD", orderId: "ord1", reason: "Wrong size" },
      { secret_key: "sk_test_abc" },
    );

    expect(result.success).toBe(true);
    expect(result.refundId).toBe("ref_tap_1");
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBe("Bearer sk_test_abc");
  });

  it("validateCredentials calls accounts/info", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("tap")!;
    const result = await adapter.validateCredentials({ secret_key: "sk_test_abc" });
    expect(result.valid).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toContain("api.tap.company/v2/accounts/info");
  });
});

describe("Yotpo adapter", () => {
  it("issueStoreCredit sends x-api-key and x-guid headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ id: "adj_1" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("yotpo")!;
    const result = await adapter.issueStoreCredit!(
      { amount: 500, currency: "INR", customerEmail: "test@example.com", orderId: "ord1" },
      { api_key: "yotpo_key", guid: "yotpo_guid" },
    );

    expect(result.success).toBe(true);
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers["x-api-key"]).toBe("yotpo_key");
    expect(headers["x-guid"]).toBe("yotpo_guid");
  });

  it("validateCredentials calls customers/count", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("yotpo")!;
    const result = await adapter.validateCredentials({ api_key: "k", guid: "g" });
    expect(result.valid).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toContain("loyalty.yotpo.com/api/v2/customers/count");
  });
});

describe("Cashgram adapter", () => {
  it("authorize + processRefund flow", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: "SUCCESS", data: { token: "bearer_token" } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: "SUCCESS" }) });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("cashgram")!;
    const result = await adapter.processRefund(
      { paymentId: "pay1", amount: 200, currency: "INR", orderId: "ord1", customerEmail: "test@e.com" },
      { client_id: "cid", client_secret: "cs", environment: "test" },
    );

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call = authorize
    expect(mockFetch.mock.calls[0][0]).toContain("payout-gamma.cashfree.com/payout/v1/authorize");
    // Second call = cashgram create
    expect(mockFetch.mock.calls[1][0]).toContain("payout-gamma.cashfree.com/payout/v1/cashgram/create");
  });

  it("validateCredentials returns false on auth failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ status: "ERROR" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("cashgram")!;
    const result = await adapter.validateCredentials({ client_id: "bad", client_secret: "bad", environment: "test" });
    expect(result.valid).toBe(false);
  });
});

describe("Partner app adapters have setupNote", () => {
  const partnerApps = ["nector", "nector_loyalty_wallet", "flits", "credityard"];
  for (const key of partnerApps) {
    it(`${key}: isPartnerApp=true and has setupNote`, () => {
      const entry = paymentRegistry.get(key);
      expect(entry).toBeDefined();
      expect(entry!.isPartnerApp).toBe(true);
      expect(entry!.setupNote).toBeDefined();
      expect(entry!.setupNote!.length).toBeGreaterThan(0);
    });
  }
});

describe("Contact-required adapters have contactEmail", () => {
  const contactRequired = ["gyftr", "easyrewardz", "transbnk"];
  for (const key of contactRequired) {
    it(`${key}: has contactEmail`, () => {
      const entry = paymentRegistry.get(key);
      expect(entry).toBeDefined();
      expect(entry!.contactEmail).toBeDefined();
    });
  }
});

describe("Razorpay processRefund", () => {
  it("sends correct Basic Auth and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "rfnd_123", entity: "refund", amount: 10000, status: "processed" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.processRefund(
      { paymentId: "pay_abc", amount: 10000, currency: "INR", orderId: "ord1", reason: "Size issue" },
      { keyId: "rzp_test_123", keySecret: "secret_456" },
    );

    expect(result.success).toBe(true);
    expect(result.refundId).toBe("rfnd_123");
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("returns failure on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: { description: "Unauthorized" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.processRefund(
      { paymentId: "pay_bad", amount: 100, currency: "INR", orderId: "ord1" },
      { keyId: "rzp_test_bad", keySecret: "bad_secret" },
    );
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });
});

describe("Stripe processRefund", () => {
  it("sends Bearer auth and form-encoded body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "re_123", object: "refund", status: "succeeded", amount: 5000 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.processRefund(
      { paymentId: "pi_abc", amount: 5000, currency: "USD", orderId: "ord1" },
      { secretKey: "sk_test_123" },
    );

    expect(result.success).toBe(true);
    expect(result.refundId).toBe("re_123");
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBe("Bearer sk_test_123");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("handles charge ID vs payment_intent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ id: "re_456", status: "succeeded", amount: 1000 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("stripe")!;
    await adapter.processRefund(
      { paymentId: "ch_charge123", amount: 1000, currency: "USD", orderId: "ord2" },
      { secretKey: "sk_test_123" },
    );

    const body = (mockFetch.mock.calls[0][1] as any).body as string;
    expect(body).toContain("charge=ch_charge123");
  });
});

describe("Cashfree processRefund", () => {
  it("sends x-client-id and x-client-secret headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cf_refund_id: "cf_ref_1", refund_status: "SUCCESS", refund_amount: 500 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("cashfree")!;
    const result = await adapter.processRefund(
      { paymentId: "pay_cf_1", amount: 500, currency: "INR", orderId: "ord_cf_1" },
      { appId: "cf_app", secretKey: "cf_secret", environment: "sandbox" },
    );

    expect(result.success).toBe(true);
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers["x-client-id"]).toBe("cf_app");
    expect(headers["x-client-secret"]).toBe("cf_secret");
  });
});

describe("Razorpay validateCredentials", () => {
  it("validates credentials with successful API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("ok") });
    vi.stubGlobal("fetch", mockFetch);
    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({ keyId: "rzp_test_123", keySecret: "secret_test_456" });
    expect(result.valid).toBe(true);
  });

  it("returns invalid when API call fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }), text: () => Promise.resolve("Unauthorized") });
    vi.stubGlobal("fetch", mockFetch);
    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({ keyId: "rzp_test_bad", keySecret: "secret_bad" });
    expect(result.valid).toBe(false);
  });

  it("returns invalid when credentials are missing", async () => {
    const adapter = paymentRegistry.getAdapter("razorpay")!;
    const result = await adapter.validateCredentials({});
    expect(result.valid).toBe(false);
  });
});

describe("Stripe validateCredentials", () => {
  it("validates with successful API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ object: "balance" }), text: () => Promise.resolve("ok") });
    vi.stubGlobal("fetch", mockFetch);
    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({ secretKey: "sk_test_123" });
    expect(result.valid).toBe(true);
  });

  it("returns invalid when API call fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", mockFetch);
    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({ secretKey: "sk_test_bad" });
    expect(result.valid).toBe(false);
  });

  it("returns invalid when credentials are missing", async () => {
    const adapter = paymentRegistry.getAdapter("stripe")!;
    const result = await adapter.validateCredentials({});
    expect(result.valid).toBe(false);
  });
});

describe("Flits issueStoreCredit", () => {
  it("calls Flits API with correct headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ id: "flits_1" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = paymentRegistry.getAdapter("flits")!;
    const result = await adapter.issueStoreCredit!(
      { amount: 100, currency: "INR", customerEmail: "t@e.com", orderId: "ord1" },
      { api_key: "flits_key", shop_domain: "test.myshopify.com" },
    );

    expect(result.success).toBe(true);
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers["X-Shopify-Shop-Domain"]).toBe("test.myshopify.com");
    expect(headers.Authorization).toBe("Bearer flits_key");
  });
});
