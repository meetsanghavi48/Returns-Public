import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PickupParams } from "~/adapters/logistics/base";

const PICKUP_PARAMS: PickupParams = {
  returnId: "ret-001",
  senderName: "Ayumu Hirano",
  senderPhone: "9820899979",
  senderAddress: "31 New Tara Apartment",
  senderCity: "Mumbai",
  senderState: "Maharashtra",
  senderPincode: "400086",
  senderCountry: "India",
  receiverName: "BLAKC Store",
  receiverPhone: "9820899979",
  receiverAddress: "Room No. 1 Radhabai Compound",
  receiverCity: "Mumbai",
  receiverState: "Maharashtra",
  receiverPincode: "400086",
  receiverCountry: "India",
  weight: 500,
  length: 10,
  breadth: 10,
  height: 5,
  items: [{ name: "Selling Plans Ski Wax", sku: "SKI-WAX-001", quantity: 1, price: 49.95 }],
  orderNumber: "1002",
  paymentMode: "prepaid",
};

describe("Shiprocket adapter — API integration", () => {
  let ShiprocketAdapter: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    const mod = await import("~/adapters/logistics/shiprocket");
    ShiprocketAdapter = mod.ShiprocketAdapter;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("authenticate sends correct email/password", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: JSON.parse(opts?.body || "{}") });
      if (String(url).includes("auth/login")) {
        return new Response(JSON.stringify({ token: "jwt-test-123" }), { status: 200 });
      }
      return new Response(JSON.stringify({ order_id: "SR001", awb_code: "AWB-SR-001" }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "test@sr.com", password: "pass123", length: "10", breadth: "10", height: "5", weight: "0.5" });

    expect(calls[0].url).toContain("auth/login");
    expect(calls[0].body.email).toBe("test@sr.com");
    expect(calls[0].body.password).toBe("pass123");
    expect(result.success).toBe(true);
    expect(result.awb).toBe("AWB-SR-001");
  });

  it("createPickup sends correct return order payload", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null, headers: opts?.headers });
      if (String(url).includes("auth/login")) {
        return new Response(JSON.stringify({ token: "jwt-123" }), { status: 200 });
      }
      return new Response(JSON.stringify({ awb_code: "AWB123", tracking_url: "https://track.sr.in/AWB123" }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "t@t.com", password: "p", length: "10", breadth: "10", height: "5", weight: "0.5" });

    const createCall = calls.find(c => String(c.url).includes("orders/create/return"));
    expect(createCall).toBeTruthy();
    expect(createCall.body.pickup_customer_name).toBe("Ayumu Hirano");
    expect(createCall.body.pickup_pincode).toBe("400086");
    expect(createCall.body.shipping_customer_name).toBe("BLAKC Store");
    expect(createCall.body.payment_method).toBe("Prepaid");
    expect(createCall.body.order_items).toHaveLength(1);
    expect(createCall.body.order_items[0].name).toBe("Selling Plans Ski Wax");
    expect(createCall.headers.Authorization).toBe("Bearer jwt-123");
    expect(result.success).toBe(true);
    expect(result.trackingUrl).toBe("https://track.sr.in/AWB123");
  });

  it("handles auth failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    ) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "bad", password: "bad" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("auth failed");
  });

  it("handles API error response", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({ message: "Invalid pincode" }), { status: 400 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "t@t.com", password: "p" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("400");
  });

  it("trackShipment parses tracking response", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({
        tracking_data: {
          shipment_track: [{ current_status: "In Transit", "sr-status": "6", edd: "2026-04-01" }],
          shipment_track_activities: [
            { date: "2026-03-25", activity: "Picked up", "sr-status-label": "PICKED_UP", location: "Mumbai" },
            { date: "2026-03-26", activity: "In Transit", "sr-status-label": "IN_TRANSIT", location: "Delhi Hub" },
          ],
        },
      }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.trackShipment("AWB123", { email: "t@t.com", password: "p" });
    expect(result.success).toBe(true);
    expect(result.currentStatus).toBe("In Transit");
    expect(result.events).toHaveLength(2);
    expect(result.events[0].location).toBe("Mumbai");
    expect(result.isDelivered).toBe(false);
  });

  it("trackShipment detects delivered status", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({
        tracking_data: {
          shipment_track: [{ current_status: "Delivered" }],
          shipment_track_activities: [],
        },
      }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.trackShipment("AWB123", { email: "t@t.com", password: "p" });
    expect(result.isDelivered).toBe(true);
  });

  it("checkServiceability returns available couriers", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({
        data: {
          available_courier_companies: [
            { estimated_delivery_days: 3, cod: 1, courier_name: "Delhivery" },
            { estimated_delivery_days: 5, cod: 0, courier_name: "BlueDart" },
          ],
        },
      }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.checkServiceability("400086", "110001", { email: "t@t.com", password: "p" });
    expect(result.serviceable).toBe(true);
    expect(result.estimatedDays).toBe(3);
    expect(result.codAvailable).toBe(true);
  });

  it("checkServiceability returns false for unserviceable route", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({ data: { available_courier_companies: [] } }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.checkServiceability("999999", "000000", { email: "t@t.com", password: "p" });
    expect(result.serviceable).toBe(false);
  });

  it("validateCredentials returns true for valid creds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "jwt" }), { status: 200 })
    ) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.validateCredentials({ email: "t@t.com", password: "p" });
    expect(result.valid).toBe(true);
  });

  it("validateCredentials returns false for invalid creds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    ) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.validateCredentials({ email: "bad", password: "bad" });
    expect(result.valid).toBe(false);
  });

  it("cancelPickup sends cancel request", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      if (String(url).includes("auth/login")) return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    const adapter = new ShiprocketAdapter();
    const result = await adapter.cancelPickup("ORDER123", { email: "t@t.com", password: "p" });
    expect(result.success).toBe(true);
    const cancelCall = calls.find(c => String(c.url).includes("orders/cancel"));
    expect(cancelCall.body.ids).toContain("ORDER123");
  });
});

describe("Nimbuspost adapter — API integration", () => {
  let NimbuspostAdapter: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    const mod = await import("~/adapters/logistics/nimbuspost");
    NimbuspostAdapter = mod.NimbuspostAdapter;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("authenticate sends correct payload to /users/login", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      if (String(url).includes("users/login")) return new Response(JSON.stringify({ data: "nb-jwt-123" }), { status: 200 });
      return new Response(JSON.stringify({ data: { awb_number: "NB-AWB-001" } }), { status: 200 });
    }) as any;

    const adapter = new NimbuspostAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "nb@test.com", password: "pass" });

    expect(calls[0].url).toContain("users/login");
    expect(calls[0].body.email).toBe("nb@test.com");
    expect(result.success).toBe(true);
    expect(result.awb).toBe("NB-AWB-001");
  });

  it("createPickup builds correct shipment payload", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      if (String(url).includes("users/login")) return new Response(JSON.stringify({ data: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({ data: { awb_number: "NB001" } }), { status: 200 });
    }) as any;

    const adapter = new NimbuspostAdapter();
    await adapter.createPickup(PICKUP_PARAMS, { email: "t@t.com", password: "p" });

    const shipmentCall = calls.find(c => String(c.url).includes("/shipments") && !String(c.url).includes("login"));
    expect(shipmentCall).toBeTruthy();
    expect(shipmentCall.body.pickup_address.name).toBe("Ayumu Hirano");
    expect(shipmentCall.body.pickup_address.pincode).toBe("400086");
    expect(shipmentCall.body.shipping_address.name).toBe("BLAKC Store");
    expect(shipmentCall.body.payment_type).toBe("prepaid");
    expect(shipmentCall.body.package_weight).toBe(0.5); // 500g -> 0.5kg
  });

  it("handles auth failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    ) as any;

    const adapter = new NimbuspostAdapter();
    const result = await adapter.createPickup(PICKUP_PARAMS, { email: "bad", password: "bad" });
    expect(result.success).toBe(false);
  });

  it("trackShipment parses tracking data", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("users/login")) return new Response(JSON.stringify({ data: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({
        data: {
          current_status: "In Transit",
          status_code: "IT",
          history: [
            { timestamp: "2026-03-25T10:00:00", status: "Picked Up", location: "Mumbai" },
          ],
        },
      }), { status: 200 });
    }) as any;

    const adapter = new NimbuspostAdapter();
    const result = await adapter.trackShipment("NB001", { email: "t@t.com", password: "p" });
    expect(result.success).toBe(true);
    expect(result.currentStatus).toBe("In Transit");
    expect(result.events).toHaveLength(1);
  });

  it("cancelPickup sends awb in body", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      if (String(url).includes("users/login")) return new Response(JSON.stringify({ data: "jwt" }), { status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    const adapter = new NimbuspostAdapter();
    const result = await adapter.cancelPickup("NB-AWB-001", { email: "t@t.com", password: "p" });
    expect(result.success).toBe(true);
    const cancelCall = calls.find(c => String(c.url).includes("shipments/cancel"));
    expect(cancelCall.body.awb).toBe("NB-AWB-001");
  });
});

describe("Multi-provider orchestration via logistics.server", () => {
  it("logistics registry has both Shiprocket and Nimbuspost", async () => {
    const { logisticsRegistry } = await import("~/adapters/logistics");
    const sr = logisticsRegistry.getAdapter("shiprocket");
    const nb = logisticsRegistry.getAdapter("nimbuspost");
    expect(sr).toBeTruthy();
    expect(nb).toBeTruthy();
    expect(sr!.key).toBe("shiprocket");
    expect(nb!.key).toBe("nimbuspost");
  });

  it("registry lists all adapters with correct interface", async () => {
    const { logisticsRegistry } = await import("~/adapters/logistics");
    const all = logisticsRegistry.list();
    expect(all.length).toBeGreaterThan(10);
    for (const entry of all) {
      expect(entry.adapter.key).toBeTruthy();
      expect(entry.adapter.displayName).toBeTruthy();
      expect(typeof entry.adapter.createPickup).toBe("function");
      expect(typeof entry.adapter.trackShipment).toBe("function");
      expect(typeof entry.adapter.checkServiceability).toBe("function");
      expect(typeof entry.adapter.validateCredentials).toBe("function");
      expect(typeof entry.adapter.cancelPickup).toBe("function");
    }
  });

  it("different adapters can be selected by providerKey", async () => {
    const { logisticsRegistry } = await import("~/adapters/logistics");
    const providers = ["delhivery", "shiprocket", "nimbuspost", "shippo", "fedex", "bluedart", "dtdc"];
    for (const key of providers) {
      const adapter = logisticsRegistry.getAdapter(key);
      expect(adapter).toBeTruthy();
      expect(adapter!.key).toBe(key);
    }
  });
});
