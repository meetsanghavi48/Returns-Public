import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
  type AdapterMeta,
} from "./base";

const API_BASE = "https://api.shadowfax.in";

async function shadowfaxFetch(
  apiKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Token ${apiKey}`,
  };
  const opts: RequestInit = { method, headers };

  if (body) {
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

export class ShadowfaxAdapter extends LogisticsAdapter {
  readonly key = "shadowfax";
  readonly displayName = "Shadowfax";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=shadowfax.in&sz=64";
  readonly meta: AdapterMeta = {
    qcSupport: true,
    contactEmail: "hello@shadowfax.in",
  };

  readonly credentialFields: CredentialField[] = [
    {
      key: "api_token",
      label: "API Token",
      type: "text",
      required: true,
      placeholder: "Enter your API token",
    },
    {
      key: "gstin",
      label: "GSTIN",
      type: "text",
      required: true,
      placeholder: "Enter your GSTIN",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { api_token, gstin } = credentials;

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
      gstin,
      order_id: `${params.orderNumber}_${params.returnId}`,
      order_type: "reverse",
      pickup_details: {
        name: params.senderName.slice(0, 50) || "Customer",
        phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
        address: params.senderAddress.slice(0, 200),
        city: params.senderCity,
        state: params.senderState,
        pincode: params.senderPincode,
        country: params.senderCountry || "India",
      },
      drop_details: {
        name: params.receiverName.slice(0, 50) || "Warehouse",
        phone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
        address: params.receiverAddress.slice(0, 200),
        city: params.receiverCity,
        state: params.receiverState,
        pincode: params.receiverPincode,
        country: params.receiverCountry || "India",
      },
      package_details: {
        weight: Math.max(params.weight / 1000, 0.5),
        length: params.length || 30,
        breadth: params.breadth || 25,
        height: params.height || 10,
        description: productsDesc,
        quantity: params.items.reduce((sum, i) => sum + i.quantity, 0) || 1,
        invoice_value: totalAmount,
      },
      payment_mode: params.paymentMode === "cod" ? "COD" : "PREPAID",
      cod_amount: params.paymentMode === "cod" ? totalAmount : 0,
      items: params.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
      })),
    };

    try {
      const data = await shadowfaxFetch(
        api_token,
        "POST",
        "/api/v2/orders/",
        payload,
      );

      const awb =
        data?.awb_number ||
        data?.tracking_id ||
        data?.data?.awb_number ||
        data?.data?.tracking_id ||
        data?.order_id;

      if (awb) {
        return {
          success: true,
          awb: String(awb),
          trackingUrl: `https://tracker.shadowfax.in/#/track/${awb}`,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.error ||
        data?.message ||
        data?.detail ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Shadowfax did not return an AWB number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Shadowfax pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { api_token } = credentials;

    try {
      const data = await shadowfaxFetch(
        api_token,
        "GET",
        `/api/v2/orders/${encodeURIComponent(awb)}/status/`,
      );

      const trackingData = data?.data || data;

      if (!trackingData || data?.error) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data?.error || data?.message || "No tracking data found",
          rawResponse: data,
        };
      }

      const scans: any[] =
        trackingData?.status_history ||
        trackingData?.tracking_history ||
        trackingData?.events ||
        [];

      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.timestamp || scan.created_at || scan.date || "",
        status: scan.status || scan.activity || "",
        statusCode: scan.status_code || scan.statusCode || "",
        location: scan.location || scan.city || "",
        description: scan.remark || scan.description || scan.status || "",
      }));

      const currentStatus =
        trackingData?.current_status ||
        trackingData?.status ||
        "In Transit";
      const currentStatusCode =
        trackingData?.current_status_code ||
        trackingData?.status_code ||
        "";
      const statusStr = typeof currentStatus === "string" ? currentStatus : String(currentStatus);
      const isDelivered =
        statusStr.toLowerCase().includes("delivered") ||
        currentStatusCode === "DL" ||
        currentStatusCode === "DELIVERED";

      return {
        success: true,
        awb,
        currentStatus: statusStr,
        currentStatusCode: String(currentStatusCode),
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
        error: err.message || "Failed to track Shadowfax shipment",
      };
    }
  }

  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { api_token } = credentials;

    try {
      // Shadowfax may not have a dedicated serviceability endpoint; use orders API
      // to check if the pincodes are served. Fall back to a pincode check endpoint.
      const data = await shadowfaxFetch(
        api_token,
        "GET",
        `/api/v2/serviceability/?origin_pincode=${encodeURIComponent(originPin)}&destination_pincode=${encodeURIComponent(destPin)}`,
      );

      if (data?.error || data?.status === 404) {
        // Try alternative endpoint format
        const altData = await shadowfaxFetch(
          api_token,
          "GET",
          `/api/v2/pincodes/serviceability/?pickup_pincode=${encodeURIComponent(originPin)}&drop_pincode=${encodeURIComponent(destPin)}`,
        );

        if (altData?.error && altData?.status === 404) {
          return {
            serviceable: false,
            error: `Serviceability check not available for ${originPin} -> ${destPin}`,
          };
        }

        const altResult = altData?.data || altData;
        return {
          serviceable:
            altResult?.serviceable === true ||
            altResult?.is_serviceable === true,
          estimatedDays: altResult?.estimated_days
            ? parseInt(String(altResult.estimated_days), 10)
            : undefined,
          codAvailable: altResult?.cod_available === true,
        };
      }

      const result = data?.data || data;

      const serviceable =
        result?.serviceable === true ||
        result?.is_serviceable === true;

      const estimatedDays = result?.estimated_days
        ? parseInt(String(result.estimated_days), 10)
        : result?.etd
          ? parseInt(String(result.etd), 10)
          : undefined;

      const codAvailable =
        result?.cod_available === true ||
        result?.cod === true;

      return {
        serviceable,
        estimatedDays: estimatedDays || undefined,
        codAvailable,
      };
    } catch (err: any) {
      return {
        serviceable: false,
        error: err.message || "Failed to check Shadowfax serviceability",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { api_token, gstin } = credentials;

    if (!api_token) {
      return { valid: false, error: "API Key is required" };
    }
    if (!gstin) {
      return { valid: false, error: "Client Code is required" };
    }

    try {
      // Test credentials with a lightweight API call
      const data = await shadowfaxFetch(
        api_token,
        "GET",
        `/api/v2/orders/TEST000000000/status/`,
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid token") ||
          lower.includes("authentication")
        ) {
          return { valid: false, error: "Invalid API key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }

      if (
        data?.detail?.toLowerCase?.()?.includes?.("authentication") ||
        data?.detail?.toLowerCase?.()?.includes?.("invalid")
      ) {
        return { valid: false, error: "Invalid API key" };
      }

      // Any other response (including order not found) means credentials are valid
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate Shadowfax credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { api_token } = credentials;

    try {
      const data = await shadowfaxFetch(
        api_token,
        "POST",
        `/api/v2/orders/${encodeURIComponent(awb)}/cancel/`,
        {
          reason: "Cancelled by merchant",
        },
      );

      if (
        data?.success === true ||
        data?.status === true ||
        data?.message?.toLowerCase?.()?.includes?.("cancel")
      ) {
        return { success: true };
      }

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (lower.includes("success") || lower.includes("cancelled") || lower.includes("canceled")) {
          return { success: true };
        }
      }

      // Some APIs return 200 with the order data on successful cancellation
      if (data?.data?.status?.toLowerCase?.()?.includes?.("cancel")) {
        return { success: true };
      }

      const errMsg =
        data?.error ||
        data?.message ||
        data?.detail ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Shadowfax pickup",
      };
    }
  }
}
