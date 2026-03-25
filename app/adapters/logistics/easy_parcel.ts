import {
  LogisticsAdapter,
  type CredentialField,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
} from "./base";

const API_BASE = "https://api.easyparcel.com";

async function easyParcelFetch(
  urlPath: string,
  body: Record<string, unknown>,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const opts: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class EasyParcelAdapter extends LogisticsAdapter {
  readonly key = "easy_parcel";
  readonly displayName = "Easy Parcel";
  readonly region = "SEA";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=easyparcel.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Easy Parcel API key",
      helpText: "Found in your Easy Parcel dashboard under API settings",
    },
    {
      key: "authKey",
      label: "Auth Key",
      type: "password",
      required: true,
      placeholder: "Enter your Easy Parcel auth key",
      helpText: "Authentication key for order operations",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { apiKey, authKey } = credentials;

    const totalWeight = Math.max(params.weight / 1000, 0.5);
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";
    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const payload = {
      api: apiKey,
      authentication_key: authKey,
      bulk: [
        {
          pick_name: (params.senderName || "Customer").slice(0, 50),
          pick_contact: params.senderPhone.replace(/[^0-9]/g, "").slice(-12) || "0000000000",
          pick_addr1: (params.senderAddress || "N/A").slice(0, 200),
          pick_city: params.senderCity || "",
          pick_state: params.senderState || "",
          pick_code: params.senderPincode || "50000",
          pick_country: (params.senderCountry || "MY").slice(0, 2),
          send_name: (params.receiverName || "Warehouse").slice(0, 50),
          send_contact: params.receiverPhone.replace(/[^0-9]/g, "").slice(-12) || "0000000000",
          send_addr1: (params.receiverAddress || "N/A").slice(0, 200),
          send_city: params.receiverCity || "",
          send_state: params.receiverState || "",
          send_code: params.receiverPincode || "50000",
          send_country: (params.receiverCountry || "MY").slice(0, 2),
          weight: totalWeight,
          width: params.breadth || 25,
          length: params.length || 30,
          height: params.height || 10,
          content: productsDesc,
          value: totalAmount,
          service_id: "",
          reference: `RET-${params.orderNumber}-${params.returnId}`,
          collect_date: new Date().toISOString().split("T")[0],
        },
      ],
    };

    try {
      const data = await easyParcelFetch("/v2/order/submit", payload);

      const order = data?.result?.[0] || data?.result;
      const orderNumber = order?.order_number || order?.parcel_number || order?.id;
      const trackingNo = order?.tracking_number || order?.awb;

      if (orderNumber || trackingNo) {
        return {
          success: true,
          awb: trackingNo || orderNumber,
          trackingUrl: trackingNo
            ? `https://easyparcel.com/track/?tracking_no=${trackingNo}`
            : undefined,
          rawResponse: data,
        };
      }

      const errMsg =
        order?.error ||
        order?.remarks ||
        data?.error_remark ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Easy Parcel did not return an order/tracking number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Easy Parcel order",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { apiKey, authKey } = credentials;

    const payload = {
      api: apiKey,
      authentication_key: authKey,
      tracking_number: [awb],
    };

    try {
      const data = await easyParcelFetch("/v2/order/tracking", payload);

      const result = data?.result?.[0] || data?.result;

      if (!result) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: "No tracking data found",
          rawResponse: data,
        };
      }

      const trackingHistory: any[] = result?.tracking_history || result?.checkpoints || [];
      const events: TrackingEvent[] = trackingHistory.map((event: any) => ({
        timestamp: event.date || event.timestamp || "",
        status: event.status || event.description || "",
        statusCode: event.status_code || "",
        location: event.location || event.city || "",
        description: event.description || event.status || "",
      }));

      const currentStatus =
        result?.latest_status || result?.status || events[0]?.status || "In Transit";
      const currentStatusCode =
        result?.latest_status_code || events[0]?.statusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode.toLowerCase().includes("delivered");

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
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
    const { apiKey } = credentials;

    const payload = {
      api: apiKey,
      bulk: [
        {
          pick_code: originPin,
          pick_country: "MY",
          send_code: destPin,
          send_country: "MY",
          weight: 1,
          width: 25,
          length: 30,
          height: 10,
        },
      ],
    };

    try {
      const data = await easyParcelFetch("/v2/rate/checking", payload);

      const rates = data?.result?.[0]?.rates || data?.result?.[0]?.services || [];

      if (!rates.length) {
        return {
          serviceable: false,
          error: `No services available between ${originPin} and ${destPin}`,
        };
      }

      // Get estimated days from the first available service
      const firstRate = rates[0];
      const estimatedDays = firstRate?.delivery
        ? parseInt(firstRate.delivery, 10) || undefined
        : undefined;
      const codAvailable = rates.some((r: any) => r?.cod === "1" || r?.cod === true);

      return {
        serviceable: true,
        estimatedDays,
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
    const { apiKey } = credentials;

    if (!apiKey) {
      return { valid: false, error: "API key is required" };
    }

    try {
      // Validate by making a lightweight rate check
      const data = await easyParcelFetch("/v2/rate/checking", {
        api: apiKey,
        bulk: [
          {
            pick_code: "50000",
            pick_country: "MY",
            send_code: "10000",
            send_country: "MY",
            weight: 1,
            width: 25,
            length: 30,
            height: 10,
          },
        ],
      });

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid api")
        ) {
          return { valid: false, error: "Invalid API key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }

      // Check EasyParcel-specific error responses
      if (data?.error_code && data.error_code !== "0") {
        return { valid: false, error: data.error_remark || "Invalid API key" };
      }

      if (data?.result !== undefined) {
        return { valid: true };
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
    const { apiKey, authKey } = credentials;

    const payload = {
      api: apiKey,
      authentication_key: authKey,
      order_number: [awb],
    };

    try {
      const data = await easyParcelFetch("/v2/order/cancel", payload);

      const result = data?.result?.[0] || data?.result;

      if (result?.status === "success" || result?.status === "cancelled" || !data?.error_code || data?.error_code === "0") {
        if (data?.error_code && data.error_code !== "0") {
          return {
            success: false,
            error: data.error_remark || result?.remarks || "Failed to cancel order",
          };
        }
        return { success: true };
      }

      const errMsg =
        result?.error ||
        result?.remarks ||
        data?.error_remark ||
        JSON.stringify(data).slice(0, 300);

      return { success: false, error: errMsg || "Cancellation response unclear" };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel order",
      };
    }
  }
}
