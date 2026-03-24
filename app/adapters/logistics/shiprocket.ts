import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type TrackingEvent,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export class ShiprocketAdapter extends LogisticsAdapter {
  readonly key = "shiprocket";
  readonly displayName = "Shiprocket";
  readonly region = "india";
  readonly logoUrl = "/images/logos/shiprocket.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "you@company.com",
      helpText: "The email address used for your Shiprocket account",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Your Shiprocket password",
      helpText: "Your Shiprocket account password",
    },
  ];

  /**
   * Authenticate with Shiprocket and return a Bearer JWT token.
   */
  private async authenticate(
    credentials: Record<string, string>
  ): Promise<string> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shiprocket auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { token: string };
    if (!data.token) {
      throw new Error("Shiprocket auth response missing token");
    }
    return data.token;
  }

  /**
   * Helper that returns standard Authorization header.
   */
  private authHeaders(token: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  // ---------------------------------------------------------------------------
  // createPickup  →  POST /orders/create/return
  // ---------------------------------------------------------------------------
  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>
  ): Promise<PickupResult> {
    try {
      const token = await this.authenticate(credentials);

      const orderItems = params.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: item.price,
        // TODO: confirm whether `discount`, `tax`, `hsn` are required fields
      }));

      const body = {
        order_id: params.returnId,
        order_date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
        channel_id: "", // TODO: populate from credentials or config if needed
        pickup_customer_name: params.senderName,
        pickup_address: params.senderAddress,
        pickup_city: params.senderCity,
        pickup_state: params.senderState,
        pickup_pincode: params.senderPincode,
        pickup_phone: params.senderPhone,
        shipping_customer_name: params.receiverName,
        shipping_address: params.receiverAddress,
        shipping_city: params.receiverCity,
        shipping_state: params.receiverState,
        shipping_pincode: params.receiverPincode,
        shipping_phone: params.receiverPhone,
        order_items: orderItems,
        payment_method: params.paymentMode === "cod" ? "COD" : "Prepaid",
        sub_total: params.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        ),
        length: params.length ?? 10,
        breadth: params.breadth ?? 10,
        height: params.height ?? 10,
        weight: params.weight / 1000, // API expects kg; PickupParams has grams
      };

      const res = await fetch(`${BASE_URL}/orders/create/return`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          error: `Shiprocket create-return failed (${res.status}): ${JSON.stringify(data)}`,
          rawResponse: data,
        };
      }

      // TODO: verify exact response shape — Shiprocket docs vary by version
      return {
        success: true,
        awb: (data.awb_code as string) ?? undefined,
        trackingUrl: (data.tracking_url as string) ?? undefined,
        labelUrl: (data.label_url as string) ?? undefined,
        estimatedPickup: (data.pickup_scheduled_date as string) ?? undefined,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // trackShipment  →  GET /courier/track/awb/{awb_code}
  // ---------------------------------------------------------------------------
  async trackShipment(
    awb: string,
    credentials: Record<string, string>
  ): Promise<TrackingResult> {
    try {
      const token = await this.authenticate(credentials);

      const res = await fetch(`${BASE_URL}/courier/track/awb/${awb}`, {
        method: "GET",
        headers: this.authHeaders(token),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          awb,
          currentStatus: "unknown",
          currentStatusCode: "UNKNOWN",
          events: [],
          isDelivered: false,
          error: `Shiprocket tracking failed (${res.status}): ${JSON.stringify(data)}`,
          rawResponse: data,
        };
      }

      // TODO: confirm exact nesting — Shiprocket wraps tracking in
      // `tracking_data.shipment_track` or `tracking_data.track_activities`
      const trackingData = (data.tracking_data ?? data) as Record<
        string,
        unknown
      >;
      const shipmentTrack = (trackingData.shipment_track as Array<
        Record<string, unknown>
      >) ?? [];
      const trackActivities = (trackingData.shipment_track_activities as Array<
        Record<string, unknown>
      >) ?? [];

      const events: TrackingEvent[] = trackActivities.map((act) => ({
        timestamp: (act.date as string) ?? "",
        status: (act.activity as string) ?? "",
        statusCode: (act["sr-status-label"] as string) ?? "",
        location: (act.location as string) ?? "",
        description: (act.activity as string) ?? "",
      }));

      const latestTrack =
        shipmentTrack.length > 0 ? shipmentTrack[0] : undefined;
      const currentStatus =
        (latestTrack?.current_status as string) ?? "unknown";
      const delivered =
        currentStatus.toLowerCase().includes("delivered") ?? false;

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode:
          (latestTrack?.["sr-status"] as string) ??
          currentStatus.toUpperCase(),
        estimatedDelivery:
          (latestTrack?.edd as string) ?? undefined,
        events,
        isDelivered: delivered,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        awb,
        currentStatus: "unknown",
        currentStatusCode: "ERROR",
        events: [],
        isDelivered: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // checkServiceability  →  GET /courier/serviceability/
  // ---------------------------------------------------------------------------
  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>
  ): Promise<ServiceabilityResult> {
    try {
      const token = await this.authenticate(credentials);

      // Default weight 0.5 kg and COD = 0 (prepaid).
      // TODO: accept weight and cod flag via extra options if needed
      const qs = new URLSearchParams({
        pickup_postcode: originPin,
        delivery_postcode: destPin,
        cod: "0",
        weight: "0.5",
      });

      const res = await fetch(
        `${BASE_URL}/courier/serviceability/?${qs.toString()}`,
        {
          method: "GET",
          headers: this.authHeaders(token),
        }
      );

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          serviceable: false,
          error: `Shiprocket serviceability check failed (${res.status}): ${JSON.stringify(data)}`,
        };
      }

      // TODO: response contains `data.available_courier_companies[]` — parse
      // estimated_delivery_days and cod from first available courier
      const companies =
        ((data.data as Record<string, unknown>)
          ?.available_courier_companies as Array<
          Record<string, unknown>
        >) ?? [];

      if (companies.length === 0) {
        return { serviceable: false };
      }

      const first = companies[0];
      return {
        serviceable: true,
        estimatedDays: (first.estimated_delivery_days as number) ?? undefined,
        codAvailable: (first.cod as number) === 1,
      };
    } catch (err) {
      return {
        serviceable: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // validateCredentials  →  just attempt authentication
  // ---------------------------------------------------------------------------
  async validateCredentials(
    credentials: Record<string, string>
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.authenticate(credentials);
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // cancelPickup  →  POST /orders/cancel  { ids: [orderId] }
  // ---------------------------------------------------------------------------
  async cancelPickup(
    awb: string,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.authenticate(credentials);

      // Shiprocket cancel expects order ids, not AWB directly.
      // TODO: if we only have AWB, we may need to look up the order id first
      // via GET /orders?awb={awb}. For now we pass awb hoping it is the order id.
      const res = await fetch(`${BASE_URL}/orders/cancel`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: JSON.stringify({ ids: [awb] }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          error: `Shiprocket cancel failed (${res.status}): ${JSON.stringify(data)}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
