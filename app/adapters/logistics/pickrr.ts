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

const API_BASE = "https://pickrr.com";

async function pickrrFetch(
  authToken: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Token ${authToken}`,
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

/**
 * Pickrr logistics adapter.
 * Note: Pickrr has been acquired by Shiprocket.
 */
export class PickrrAdapter extends LogisticsAdapter {
  readonly key = "pickrr";
  readonly displayName = "Pickrr";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=pickrr.com&sz=64";
  readonly meta: AdapterMeta = {
    qcSupport: true,
    setupGuideUrl: "https://docs.pickrr.com/",
  };

  readonly credentialFields: CredentialField[] = [
    {
      key: "auth_token",
      label: "Auth Token",
      type: "text",
      required: true,
      placeholder: "Enter your auth token",
    },
    {
      key: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "Enter your email",
    },
    {
      key: "qc_enabled",
      label: "Would you like to enable QC services?",
      type: "select",
      required: false,
      options: [{ label: "No", value: "No" }, { label: "Yes", value: "Yes" }],
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { auth_token } = credentials;

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
      item_name: productsDesc,
      from_name: params.senderName.slice(0, 50) || "Customer",
      from_phone_number: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
      from_address: params.senderAddress.slice(0, 200),
      from_city: params.senderCity,
      from_state: params.senderState,
      from_pincode: params.senderPincode,
      from_country: params.senderCountry || "India",
      to_name: params.receiverName.slice(0, 50) || "Warehouse",
      to_phone_number: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
      to_address: params.receiverAddress.slice(0, 200),
      to_city: params.receiverCity,
      to_state: params.receiverState,
      to_pincode: params.receiverPincode,
      to_country: params.receiverCountry || "India",
      quantity: params.items.reduce((sum, i) => sum + i.quantity, 0) || 1,
      invoice_value: totalAmount,
      item_breadth: params.breadth || 25,
      item_length: params.length || 30,
      item_height: params.height || 10,
      item_weight: Math.max(params.weight / 1000, 0.5),
      cod_amount: params.paymentMode === "cod" ? totalAmount : 0,
      payment_mode: params.paymentMode === "cod" ? "cod" : "prepaid",
      is_reverse: true,
      client_order_id: `${params.orderNumber}_${params.returnId}`,
    };

    try {
      const data = await pickrrFetch(
        auth_token,
        "POST",
        "/api-v2/client/create-order/",
        payload,
      );

      const awb =
        data?.tracking_id ||
        data?.awb_number ||
        data?.data?.tracking_id ||
        data?.data?.awb_number;

      if (awb) {
        return {
          success: true,
          awb: String(awb),
          trackingUrl: `https://pickrr.com/tracking/#/?tracking_id=${awb}`,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.err ||
        data?.error ||
        data?.message ||
        data?.detail ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Pickrr did not return a tracking ID",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Pickrr pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { auth_token } = credentials;

    try {
      const data = await pickrrFetch(
        auth_token,
        "GET",
        `/api-v2/client/tracking/?tracking_id=${encodeURIComponent(awb)}`,
      );

      const trackingData = data?.tracking_data || data?.data || data;

      if (!trackingData || data?.err) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data?.err || data?.error || "No tracking data found",
          rawResponse: data,
        };
      }

      const scans: any[] =
        trackingData?.track_arr ||
        trackingData?.scans ||
        trackingData?.events ||
        [];

      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.timestamp || scan.date || scan.time || "",
        status: scan.status || scan.activity || "",
        statusCode: scan.status_code || scan.statusCode || "",
        location: scan.location || scan.city || "",
        description: scan.remark || scan.status || scan.activity || "",
      }));

      const currentStatus =
        trackingData?.status?.current_status_body ||
        trackingData?.current_status ||
        trackingData?.status ||
        "In Transit";
      const currentStatusCode =
        trackingData?.status?.current_status_code ||
        trackingData?.current_status_code ||
        "";
      const statusStr = typeof currentStatus === "string" ? currentStatus : "";
      const isDelivered =
        statusStr.toLowerCase().includes("delivered") ||
        currentStatusCode === "DL" ||
        currentStatusCode === "OD";

      return {
        success: true,
        awb,
        currentStatus: statusStr || "In Transit",
        currentStatusCode: String(currentStatusCode),
        estimatedDelivery: trackingData?.estimated_delivery_date || undefined,
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
        error: err.message || "Failed to track Pickrr shipment",
      };
    }
  }

  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { auth_token } = credentials;

    try {
      const data = await pickrrFetch(
        auth_token,
        "GET",
        `/api-v2/client/check-pincode-serviceability/?from_pincode=${encodeURIComponent(originPin)}&to_pincode=${encodeURIComponent(destPin)}`,
      );

      if (data?.err || data?.error) {
        return {
          serviceable: false,
          error: data.err || data.error || "Serviceability check failed",
        };
      }

      const result = data?.data || data;

      const serviceable =
        result?.serviceable === true ||
        result?.is_serviceable === true ||
        (Array.isArray(result) && result.length > 0);

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
        error: err.message || "Failed to check Pickrr serviceability",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { auth_token } = credentials;

    if (!auth_token) {
      return { valid: false, error: "Auth token is required" };
    }

    try {
      // Call tracking endpoint with a dummy AWB; auth errors mean invalid token,
      // a "not found" style error means the token itself is valid
      const data = await pickrrFetch(
        auth_token,
        "GET",
        "/api-v2/client/tracking/?tracking_id=TEST000000000",
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid token") ||
          lower.includes("authentication")
        ) {
          return { valid: false, error: "Invalid auth token" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid auth token" };
      }

      // If the response is an auth error in JSON form
      if (
        data?.detail?.toLowerCase?.()?.includes?.("authentication") ||
        data?.detail?.toLowerCase?.()?.includes?.("invalid token")
      ) {
        return { valid: false, error: "Invalid auth token" };
      }

      // Any other response (including "not found" for the dummy AWB) means credentials are valid
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate Pickrr credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { auth_token } = credentials;

    try {
      const data = await pickrrFetch(
        auth_token,
        "POST",
        "/api-v2/client/cancel-order/",
        {
          tracking_id: awb,
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

      const errMsg =
        data?.err ||
        data?.error ||
        data?.message ||
        data?.detail ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Pickrr pickup",
      };
    }
  }
}
