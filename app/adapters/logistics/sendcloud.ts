import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://panel.sendcloud.sc/api/v2";

async function sendcloudFetch(
  publicKey: string,
  secretKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = `${API_BASE}${urlPath}`;
  const authToken = btoa(`${publicKey}:${secretKey}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${authToken}`,
  };
  const opts: RequestInit = { method, headers };

  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class SendcloudAdapter extends LogisticsAdapter {
  readonly key = "sendcloud";
  readonly displayName = "Sendcloud";
  readonly region = "EU";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=sendcloud.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "public_key",
      label: "Public Key",
      type: "text",
      required: true,
      placeholder: "Your Sendcloud public key",
      helpText: "Found in Sendcloud under Settings > Integrations > API keys",
    },
    {
      key: "secret_key",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Your Sendcloud secret key",
      helpText: "Found in Sendcloud under Settings > Integrations > API keys",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { public_key, secret_key } = credentials;

    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const totalWeight = Math.max(Math.round(params.weight), 1);

    const payload = {
      parcel: {
        name: params.senderName.slice(0, 50) || "Customer",
        company_name: "",
        address: params.senderAddress.slice(0, 200),
        city: params.senderCity,
        postal_code: params.senderPincode,
        country: params.senderCountry || "NL",
        telephone: params.senderPhone,
        email: "",
        order_number: `${params.orderNumber}_${params.returnId}`,
        weight: totalWeight,
        length: params.length || 30,
        width: params.breadth || 25,
        height: params.height || 10,
        total_order_value: totalAmount.toFixed(2),
        total_order_value_currency: "EUR",
        is_return: true,
        request_label: true,
        parcel_items: params.items.map((item) => ({
          description: item.name,
          sku: item.sku,
          quantity: item.quantity,
          value: item.price.toFixed(2),
          weight: Math.round(params.weight / params.items.length).toString(),
          origin_country: params.senderCountry || "NL",
        })),
        to_address_1: params.receiverAddress.slice(0, 200),
        to_city: params.receiverCity,
        to_postal_code: params.receiverPincode,
        to_country: params.receiverCountry || "NL",
        to_name: params.receiverName.slice(0, 50) || "Warehouse",
        to_telephone: params.receiverPhone,
      },
    };

    try {
      const data = await sendcloudFetch(
        public_key,
        secret_key,
        "POST",
        "/parcels",
        payload,
      );

      const parcel = data?.parcel;
      const trackingNumber =
        parcel?.tracking_number || parcel?.carrier?.tracking_number;

      if (parcel?.id && trackingNumber) {
        return {
          success: true,
          awb: trackingNumber,
          trackingUrl: parcel?.tracking_url || undefined,
          labelUrl: parcel?.label?.normal_printer?.[0] || parcel?.label?.label_printer || undefined,
          estimatedPickup: parcel?.date_created || undefined,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.error?.message ||
        data?.message ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Sendcloud did not return a tracking number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Sendcloud parcel",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { public_key, secret_key } = credentials;

    try {
      // First try to find the parcel by tracking number
      const searchData = await sendcloudFetch(
        public_key,
        secret_key,
        "GET",
        `/parcels?tracking_number=${encodeURIComponent(awb)}`,
      );

      const parcel = searchData?.parcels?.[0];

      if (!parcel) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: "No parcel found for this tracking number",
          rawResponse: searchData,
        };
      }

      const statusHistory: any[] = parcel?.status_history || [];
      const events: TrackingEvent[] = statusHistory.map((entry: any) => ({
        timestamp: entry.created || entry.timestamp || "",
        status: entry.message || entry.status || "",
        statusCode: entry.status?.toString() || "",
        location: entry.location || "",
        description: entry.message || entry.description || "",
      }));

      const currentStatus =
        parcel?.status?.message || parcel?.status_message || "In Transit";
      const currentStatusCode = parcel?.status?.id?.toString() || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        parcel?.status?.id === 11;

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: parcel?.expected_delivery_date || undefined,
        events,
        isDelivered,
        rawResponse: parcel,
      };
    } catch (err: any) {
      return {
        success: false,
        awb,
        currentStatus: "Error",
        currentStatusCode: "",
        events: [],
        isDelivered: false,
        error: err.message || "Failed to track shipment",
      };
    }
  }

  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { public_key, secret_key } = credentials;

    try {
      const data = await sendcloudFetch(
        public_key,
        secret_key,
        "GET",
        `/shipping_methods?sender_address=${encodeURIComponent(originPin)}&to_postal_code=${encodeURIComponent(destPin)}`,
      );

      if (data?.error) {
        return {
          serviceable: false,
          error: data.error.message || "Serviceability check failed",
        };
      }

      const methods = data?.shipping_methods || [];
      const serviceable = Array.isArray(methods) && methods.length > 0;

      // Find the fastest method for estimated days
      let estimatedDays: number | undefined;
      if (serviceable && methods[0]?.max_transit_time) {
        estimatedDays = parseInt(methods[0].max_transit_time, 10);
      }

      return {
        serviceable,
        estimatedDays: estimatedDays || undefined,
        codAvailable: false,
      };
    } catch (err: any) {
      return {
        serviceable: false,
        error: err.message || "Failed to check serviceability",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { public_key, secret_key } = credentials;

    if (!public_key || !secret_key) {
      return { valid: false, error: "Public key and secret key are required" };
    }

    try {
      // Use a lightweight endpoint to validate credentials
      const data = await sendcloudFetch(
        public_key,
        secret_key,
        "GET",
        "/shipping_methods",
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid")
        ) {
          return { valid: false, error: "Invalid public key or secret key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid public key or secret key" };
      }

      if (data?.error?.code === 401 || data?.error?.code === 403) {
        return { valid: false, error: "Invalid public key or secret key" };
      }

      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { public_key, secret_key } = credentials;

    try {
      // First find the parcel ID from the tracking number
      const searchData = await sendcloudFetch(
        public_key,
        secret_key,
        "GET",
        `/parcels?tracking_number=${encodeURIComponent(awb)}`,
      );

      const parcel = searchData?.parcels?.[0];

      if (!parcel?.id) {
        return {
          success: false,
          error: "No parcel found for this tracking number",
        };
      }

      const data = await sendcloudFetch(
        public_key,
        secret_key,
        "POST",
        `/parcels/${parcel.id}/cancel`,
      );

      if (
        data?.status === "cancelled" ||
        data?.parcel?.status?.id === 2 ||
        data?.message?.toLowerCase().includes("cancel")
      ) {
        return { success: true };
      }

      // A 200-level response without explicit error often means success
      if (!data?.error && !data?.raw) {
        return { success: true };
      }

      const errMsg =
        data?.error?.message ||
        data?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Sendcloud parcel",
      };
    }
  }
}
