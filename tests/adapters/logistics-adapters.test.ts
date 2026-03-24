import { describe, it, expect } from "vitest";
import { logisticsRegistry } from "~/adapters/logistics";
import { LogisticsAdapter } from "~/adapters/logistics/base";

const STUB_ADAPTER_KEYS = [
  "australia_post",
  "royal_mail",
  "canada_post",
  "postnl",
  "correos",
  "aramex",
  "dhl_gcc",
  "quiqup",
  "oto",
  "easy_parcel",
  "starlinks",
];

describe("logistics stub adapters", () => {
  for (const key of STUB_ADAPTER_KEYS) {
    it(`${key}: createPickup throws "Not implemented"`, async () => {
      const adapter = logisticsRegistry.getAdapter(key);
      expect(adapter).toBeDefined();
      await expect(
        adapter!.createPickup(
          {
            returnId: "test",
            senderName: "Test",
            senderPhone: "1234567890",
            senderAddress: "123 Test St",
            senderCity: "TestCity",
            senderState: "TS",
            senderPincode: "000000",
            senderCountry: "IN",
            receiverName: "Receiver",
            receiverPhone: "0987654321",
            receiverAddress: "456 Recv St",
            receiverCity: "RecvCity",
            receiverState: "RS",
            receiverPincode: "111111",
            receiverCountry: "IN",
            weight: 500,
            items: [{ name: "Item", sku: "SKU1", quantity: 1, price: 100 }],
            orderNumber: "ORD-001",
            paymentMode: "prepaid",
          },
          { token: "fake" },
        ),
      ).rejects.toThrow("Not implemented");
    });
  }
});

describe("Delhivery adapter", () => {
  it('credentialFields include "token"', () => {
    const adapter = logisticsRegistry.getAdapter("delhivery");
    expect(adapter).toBeDefined();
    const fieldKeys = adapter!.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("token");
  });
});

describe("Shiprocket adapter", () => {
  it('credentialFields include "email" and "password"', () => {
    const adapter = logisticsRegistry.getAdapter("shiprocket");
    expect(adapter).toBeDefined();
    const fieldKeys = adapter!.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("email");
    expect(fieldKeys).toContain("password");
  });
});

describe("all logistics adapters have required properties", () => {
  const adapters = logisticsRegistry.list();

  for (const entry of adapters) {
    it(`${entry.key}: has key, displayName, region, logoUrl, credentialFields`, () => {
      const adapter = entry.adapter;
      expect(adapter).toBeInstanceOf(LogisticsAdapter);
      expect(typeof adapter.key).toBe("string");
      expect(adapter.key.length).toBeGreaterThan(0);
      expect(typeof adapter.displayName).toBe("string");
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(typeof adapter.region).toBe("string");
      expect(adapter.region.length).toBeGreaterThan(0);
      expect(typeof adapter.logoUrl).toBe("string");
      expect(adapter.logoUrl.length).toBeGreaterThan(0);
      expect(Array.isArray(adapter.credentialFields)).toBe(true);
      expect(adapter.credentialFields.length).toBeGreaterThan(0);
    });
  }
});
