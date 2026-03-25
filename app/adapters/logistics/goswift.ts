import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://app.goswift.in/api";

async function goswiftFetch(
  apiKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = `${API_BASE}${urlPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
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

export class GoswiftAdapter extends LogisticsAdapter {
  readonly key = "goswift";
  readonly displayName = "Goswift";
  readonly region = "IN";
  readonly logoUrl = "/logos/goswift.png";

  readonly credentialFields: CredentialField[] = [
    {
      key: "api_key",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Your Goswift API key",
      helpText: "Found in Goswift dashboard under Settings > API",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { api_key } = credentials;

    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";

    const payload = {
      order_type: "reverse",
      reference_id: `${params.orderNumber}_${params.returnId}`,
      payment_mode: params.paymentMode === "cod" ? "COD" : "PREPAID",
      total_amount: totalAmount,
      pickup_details: {
        name: params.senderName.slice(0, 50) || "Customer",
        phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
        address: params.senderAddress.slice(0, 200),
        city: params.senderCity,
        state: params.senderState,
        pincode: params.senderPincode,
        country: params.senderCountry || "India",
      },
      delivery_details: {
        name: params.receiverName.slice(0, 50) || "Warehouse",
        phone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
        address: params.receiverAddress.slice(0, 200),
        city: params.receiverCity,
        state: params.receiverState,
        pincode: params.receiverPincode,
        country: params.receiverCountry || "India",
      },
      package_details: {
        weight: params.weight, // grams
        length: params.length || 30,
        breadth: params.breadth || 25,
        height: params.height || 10,
        description: productsDesc,
      },
      items: params.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
      })),
    };

    try {
      const data = await goswiftFetch(
        api_key,
        "POST",
        "/v2/orders",
        payload,
      );

      const awb =
        data?.data?.awb_number ||
        data?.data?.tracking_number ||
        data?.awb_number;
      const orderId = data?.data?.order_id || data?.order_id;

      if (awb || orderId) {
        return {
          success: true,
          awb: awb || orderId,
          trackingUrl: data?.data?.tracking_url || undefined,
          labelUrl: data?.data?.label_url || undefined,
          estimatedPickup: data?.data?.estimated_pickup || undefined,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.message ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Goswift did not return a tracking number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Goswift order",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { api_key } = credentials;

    try {
      const data = await goswiftFetch(
        api_key,
        "GET",
        `/v2/orders/${encodeURIComponent(awb)}/tracking`,
      );

      if (!data?.data && !data?.tracking) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data?.message || "No tracking data found",
          rawResponse: data,
        };
      }

      const trackingData = data?.data || data?.tracking || {};
      const scans: any[] =
        trackingData?.events ||
        trackingData?.scans ||
        trackingData?.tracking_history ||
        [];
      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.timestamp || scan.date || scan.created_at || "",
        status: scan.status || scan.event || "",
        statusCode: scan.status_code || scan.code || "",
        location: scan.location || scan.city || "",
        description: scan.description || scan.remarks || scan.status || "",
      }));

      const currentStatus =
        trackingData?.current_status ||
        trackingData?.status ||
        events[0]?.status ||
        "In Transit";
      const currentStatusCode =
        trackingData?.current_status_code ||
        trackingData?.status_code ||
        "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "delivered";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: trackingData?.estimated_delivery || undefined,
        events,
        isDelivered,
        rawResponse: data,
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
    const { api_key } = credentials;

    try {
      const payload = {
        pickup_pincode: originPin,
        delivery_pincode: destPin,
        order_type: "reverse",
      };

      const data = await goswiftFetch(
        api_key,
        "POST",
        "/v2/serviceability/check",
        payload,
      );

      if (data?.error || data?.status === false) {
        return {
          serviceable: false,
          error: data?.message || data?.error || "Serviceability check failed",
        };
      }

      const result = data?.data || data;
      const serviceable =
        result?.serviceable === true || result?.available === true;
      const estimatedDays = result?.estimated_days
        ? parseInt(result.estimated_days, 10)
        : undefined;
      const codAvailable =
        result?.cod_available === true || result?.cod === true;

      return {
        serviceable,
        estimatedDays: estimatedDays || undefined,
        codAvailable,
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
    const { api_key } = credentials;

    if (!api_key) {
      return { valid: false, error: "API key is required" };
    }

    try {
      // Use a lightweight serviceability check to validate the API key
      const data = await goswiftFetch(
        api_key,
        "POST",
        "/v2/serviceability/check",
        { pickup_pincode: "110001", delivery_pincode: "400001", order_type: "reverse" },
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid") ||
          lower.includes("unauthenticated")
        ) {
          return { valid: false, error: "Invalid API key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }

      // Check for API-level auth errors
      if (data?.error && typeof data.error === "string") {
        const lower = data.error.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("invalid") ||
          lower.includes("unauthenticated")
        ) {
          return { valid: false, error: "Invalid API key" };
        }
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
    const { api_key } = credentials;

    try {
      const data = await goswiftFetch(
        api_key,
        "POST",
        `/v2/orders/${encodeURIComponent(awb)}/cancel`,
      );

      if (
        data?.data?.status === "cancelled" ||
        data?.success === true ||
        data?.status === true
      ) {
        return { success: true };
      }

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("success") ||
          lower.includes("cancelled") ||
          lower.includes("canceled")
        ) {
          return { success: true };
        }
      }

      // A response without error typically indicates success
      if (data?.data && !data?.error) {
        return { success: true };
      }

      const errMsg =
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Goswift order",
      };
    }
  }
}
