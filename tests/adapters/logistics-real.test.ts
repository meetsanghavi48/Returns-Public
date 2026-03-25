import { describe, it, expect, vi, afterEach } from "vitest";
import { logisticsRegistry } from "~/adapters/logistics";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PICKUP_PARAMS = {
  returnId: "ret-1",
  senderName: "Customer",
  senderPhone: "9876543210",
  senderAddress: "123 Main St",
  senderCity: "Mumbai",
  senderState: "MH",
  senderPincode: "400001",
  senderCountry: "IN",
  receiverName: "Warehouse",
  receiverPhone: "0987654321",
  receiverAddress: "456 Warehouse Rd",
  receiverCity: "Delhi",
  receiverState: "DL",
  receiverPincode: "110001",
  receiverCountry: "IN",
  weight: 500,
  items: [{ name: "T-Shirt", sku: "TSH-001", quantity: 1, price: 500 }],
  orderNumber: "ORD-1001",
  paymentMode: "prepaid" as const,
};

describe("Delhivery adapter", () => {
  it("createPickup sends Token auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(JSON.stringify({
        success: true, packages: [{ waybill: "AWB123456" }],
      })),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("delhivery")!;
    const result = await adapter.createPickup(PICKUP_PARAMS, { token: "test_token", pickupLocation: "Default" });

    expect(mockFetch).toHaveBeenCalled();
    const headers = (mockFetch.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBe("Token test_token");
  });

  it("trackShipment calls tracking endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(JSON.stringify({
        ShipmentData: [{ Shipment: { Status: { Status: "In Transit", StatusCode: "X-PPOM" }, Scans: [] } }],
      })),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("delhivery")!;
    const result = await adapter.trackShipment("AWB123456", { token: "test_token" });

    expect(result.success).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toContain("AWB123456");
  });

  it("validateCredentials returns true on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(JSON.stringify([{ name: "warehouse" }])),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("delhivery")!;
    const result = await adapter.validateCredentials({ token: "valid_token" });
    expect(result.valid).toBe(true);
  });

  it("validateCredentials returns false on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("delhivery")!;
    const result = await adapter.validateCredentials({ token: "bad_token" });
    expect(result.valid).toBe(false);
  });
});

describe("Shiprocket adapter", () => {
  it("has email and password credential fields", () => {
    const adapter = logisticsRegistry.getAdapter("shiprocket")!;
    const fieldKeys = adapter.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("email");
    expect(fieldKeys).toContain("password");
  });

  it("validateCredentials calls Shiprocket auth endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ token: "sr_token_123", id: 1 })),
      json: () => Promise.resolve({ token: "sr_token_123", id: 1 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("shiprocket")!;
    const result = await adapter.validateCredentials({ email: "test@e.com", password: "pass" });
    expect(mockFetch).toHaveBeenCalled();
    // Verify it actually called the API
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("shiprocket");
  });
});

describe("Shippo adapter", () => {
  it("has apiToken credential field", () => {
    const adapter = logisticsRegistry.getAdapter("shippo")!;
    const fieldKeys = adapter.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("apiToken");
  });

  it("validateCredentials calls Shippo API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(JSON.stringify({ results: [] })),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = logisticsRegistry.getAdapter("shippo")!;
    const result = await adapter.validateCredentials({ apiToken: "shippo_test" });
    expect(result.valid).toBe(true);
  });
});

describe("EasyPost adapter", () => {
  it("has apiKey credential field", () => {
    const adapter = logisticsRegistry.getAdapter("easypost")!;
    const fieldKeys = adapter.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("apiKey");
  });
});

describe("ShipStation adapter", () => {
  it("has apiKey and apiSecret credential fields", () => {
    const adapter = logisticsRegistry.getAdapter("shipstation")!;
    const fieldKeys = adapter.credentialFields.map((f) => f.key);
    expect(fieldKeys).toContain("apiKey");
    expect(fieldKeys).toContain("apiSecret");
  });
});
