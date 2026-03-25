import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type TrackingEvent,
  type ServiceabilityResult,
  type CredentialField,
  type AdapterMeta,
} from "./base";

const BASE_URL = "https://api.nimbuspost.com/v1";

export class NimbuspostAdapter extends LogisticsAdapter {
  readonly key = "nimbuspost";
  readonly displayName = "Nimbuspost";
  readonly region = "india";
  readonly logoUrl = "/images/logos/nimbuspost.svg";
  readonly meta: AdapterMeta = {
    qcSupport: true,
    setupGuideUrl: "https://documenter.getpostman.com/view/9692837/TW6wHnoz",
  };
  readonly credentialFields: CredentialField[] = [
    {
      key: "email",
      label: "Account Login Email",
      type: "email",
      required: true,
      placeholder: "Enter your account email id",
      helpText: "Please enter the required credentials to activate Nimbus Post. Check our step-by-step guide to connect faster.",
    },
    {
      key: "password",
      label: "Account Login Password",
      type: "password",
      required: true,
      placeholder: "Enter your account password",
    },
    {
      key: "qc_enabled",
      label: "Would you like to enable QC services?",
      type: "select",
      required: false,
      options: [{ label: "No", value: "No" }, { label: "Yes", value: "Yes" }],
    },
  ];

  /**
   * Authenticate with Nimbuspost and return a Bearer JWT token.
   */
  private async authenticate(
    credentials: Record<string, string>
  ): Promise<string> {
    const res = await fetch(`${BASE_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Nimbuspost auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { data?: string; token?: string };
    const token = data.data ?? data.token;
    if (!token) {
      throw new Error("Nimbuspost auth response missing token");
    }
    return token;
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
  // createPickup  →  POST /shipments
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
        qty: item.quantity,
        price: item.price,
        // TODO: confirm if additional item-level fields are required
      }));

      const qcEnabled = credentials.qc_enabled === "Yes";

      const body: Record<string, unknown> = {
        order_number: params.orderNumber,
        shipping_address: {
          name: params.receiverName,
          phone: params.receiverPhone,
          address: params.receiverAddress,
          city: params.receiverCity,
          state: params.receiverState,
          pincode: params.receiverPincode,
          country: params.receiverCountry,
        },
        pickup_address: {
          name: params.senderName,
          phone: params.senderPhone,
          address: params.senderAddress,
          city: params.senderCity,
          state: params.senderState,
          pincode: params.senderPincode,
          country: params.senderCountry,
        },
        order_items: orderItems,
        payment_type: params.paymentMode === "cod" ? "cod" : "prepaid",
        package_weight: params.weight / 1000,
        package_length: params.length ?? 10,
        package_breadth: params.breadth ?? 10,
        package_height: params.height ?? 10,
        ...(qcEnabled ? { qc_enable: true } : {}),
      };

      const res = await fetch(`${BASE_URL}/shipments`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          error: `Nimbuspost create-shipment failed (${res.status}): ${JSON.stringify(data)}`,
          rawResponse: data,
        };
      }

      // TODO: verify exact response keys — Nimbuspost docs may nest under `data`
      const shipment = (data.data ?? data) as Record<string, unknown>;

      return {
        success: true,
        awb: (shipment.awb_number as string) ?? undefined,
        trackingUrl: (shipment.tracking_url as string) ?? undefined,
        labelUrl: (shipment.label as string) ?? undefined,
        estimatedPickup:
          (shipment.pickup_scheduled_date as string) ?? undefined,
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
  // trackShipment  →  GET /shipments/track/{awb}
  // ---------------------------------------------------------------------------
  async trackShipment(
    awb: string,
    credentials: Record<string, string>
  ): Promise<TrackingResult> {
    try {
      const token = await this.authenticate(credentials);

      const res = await fetch(`${BASE_URL}/shipments/track/${awb}`, {
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
          error: `Nimbuspost tracking failed (${res.status}): ${JSON.stringify(data)}`,
          rawResponse: data,
        };
      }

      // TODO: confirm exact response nesting — may be under `data`
      const trackingData = (data.data ?? data) as Record<string, unknown>;
      const history = (trackingData.history as Array<
        Record<string, unknown>
      >) ?? [];

      const events: TrackingEvent[] = history.map((evt) => ({
        timestamp: (evt.timestamp as string) ?? (evt.event_time as string) ?? "",
        status: (evt.status as string) ?? "",
        statusCode: (evt.status_code as string) ?? (evt.status as string) ?? "",
        location: (evt.location as string) ?? "",
        description: (evt.message as string) ?? (evt.remark as string) ?? "",
      }));

      const currentStatus =
        (trackingData.current_status as string) ?? "unknown";
      const delivered =
        currentStatus.toLowerCase().includes("delivered") ?? false;

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode:
          (trackingData.status_code as string) ??
          currentStatus.toUpperCase(),
        estimatedDelivery:
          (trackingData.edd as string) ?? undefined,
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
  // checkServiceability  →  GET /courier/serviceability
  // ---------------------------------------------------------------------------
  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>
  ): Promise<ServiceabilityResult> {
    try {
      const token = await this.authenticate(credentials);

      const qs = new URLSearchParams({
        origin: originPin,
        destination: destPin,
        weight: "0.5", // TODO: accept weight as a parameter if needed
        payment_type: "prepaid",
      });

      const res = await fetch(
        `${BASE_URL}/courier/serviceability?${qs.toString()}`,
        {
          method: "GET",
          headers: this.authHeaders(token),
        }
      );

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          serviceable: false,
          error: `Nimbuspost serviceability check failed (${res.status}): ${JSON.stringify(data)}`,
        };
      }

      // TODO: confirm response shape — likely `data.data` is an array of couriers
      const couriers =
        (data.data as Array<Record<string, unknown>>) ?? [];

      if (couriers.length === 0) {
        return { serviceable: false };
      }

      const first = couriers[0];
      return {
        serviceable: true,
        estimatedDays: (first.estimated_delivery_days as number) ?? undefined,
        codAvailable: (first.cod as boolean) ?? undefined,
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
  // cancelPickup  →  POST /shipments/cancel  { awb }
  // ---------------------------------------------------------------------------
  async cancelPickup(
    awb: string,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.authenticate(credentials);

      const res = await fetch(`${BASE_URL}/shipments/cancel`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: JSON.stringify({ awb }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          error: `Nimbuspost cancel failed (${res.status}): ${JSON.stringify(data)}`,
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
