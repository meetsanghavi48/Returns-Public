import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://www.clickpost.in/api/v3";

async function clickpostFetch(
  username: string,
  apiKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const separator = urlPath.includes("?") ? "&" : "?";
  const url = `${API_BASE}${urlPath}${separator}username=${encodeURIComponent(username)}&key=${encodeURIComponent(apiKey)}`;
  const headers: Record<string, string> = {};
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

export class ClickPostAdapter extends LogisticsAdapter {
  readonly key = "clickpost";
  readonly displayName = "ClickPost";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=clickpost.in&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Your ClickPost username",
      helpText: "Found in your ClickPost dashboard settings",
    },
    {
      key: "api_key",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Your ClickPost API key",
      helpText: "Found in your ClickPost dashboard under API settings",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { username, api_key } = credentials;

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
      place_order: true,
      order_type: "REVERSE",
      reference_number: `${params.orderNumber}_${params.returnId}`,
      invoice_value: totalAmount,
      invoice_currency: "INR",
      payment_type: params.paymentMode === "cod" ? "COD" : "PREPAID",
      pickup_info: {
        pickup_name: params.senderName.slice(0, 50) || "Customer",
        pickup_phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
        pickup_address: params.senderAddress.slice(0, 200),
        pickup_city: params.senderCity,
        pickup_state: params.senderState,
        pickup_pincode: params.senderPincode,
        pickup_country: params.senderCountry || "India",
      },
      drop_info: {
        drop_name: params.receiverName.slice(0, 50) || "Warehouse",
        drop_phone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
        drop_address: params.receiverAddress.slice(0, 200),
        drop_city: params.receiverCity,
        drop_state: params.receiverState,
        drop_pincode: params.receiverPincode,
        drop_country: params.receiverCountry || "India",
      },
      items: params.items.map((item) => ({
        product_name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
      })),
      weight: params.weight,
      length: params.length || 30,
      breadth: params.breadth || 25,
      height: params.height || 10,
      description: productsDesc,
    };

    try {
      const data = await clickpostFetch(
        username,
        api_key,
        "POST",
        "/create-order/",
        payload,
      );

      const awb =
        data?.result?.waybill ||
        data?.result?.reference_number ||
        data?.waybill;

      if (awb && data?.meta?.status === 200) {
        return {
          success: true,
          awb,
          trackingUrl: data?.result?.tracking_url || undefined,
          labelUrl: data?.result?.label_url || undefined,
          estimatedPickup: data?.result?.estimated_pickup || undefined,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.meta?.message ||
        data?.result?.error ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "ClickPost did not return a waybill",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create ClickPost pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { username, api_key } = credentials;

    try {
      const data = await clickpostFetch(
        username,
        api_key,
        "GET",
        `/tracking/?waybill=${encodeURIComponent(awb)}`,
      );

      if (!data?.result || data?.meta?.status !== 200) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data?.meta?.message || "No tracking data found",
          rawResponse: data,
        };
      }

      const trackingData = data.result;
      const scans: any[] = trackingData?.scans || trackingData?.tracking_data || [];
      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.timestamp || scan.scan_datetime || "",
        status: scan.status || scan.clickpost_status || "",
        statusCode: scan.clickpost_status_code || scan.status_code || "",
        location: scan.location || scan.scan_location || "",
        description: scan.remark || scan.status_description || scan.status || "",
      }));

      const latestStatus =
        trackingData?.latest_status?.clickpost_status_description ||
        trackingData?.latest_status?.status ||
        "In Transit";
      const latestStatusCode =
        trackingData?.latest_status?.clickpost_status_code?.toString() || "";
      const isDelivered =
        latestStatus.toLowerCase().includes("delivered") ||
        latestStatusCode === "8";

      return {
        success: true,
        awb,
        currentStatus: latestStatus,
        currentStatusCode: latestStatusCode,
        estimatedDelivery: trackingData?.expected_delivery_date || undefined,
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
    const { username, api_key } = credentials;

    try {
      const payload = {
        pickup_pincode: originPin,
        drop_pincode: destPin,
        order_type: "REVERSE",
      };

      const data = await clickpostFetch(
        username,
        api_key,
        "POST",
        "/check-serviceability/",
        payload,
      );

      if (data?.meta?.status !== 200) {
        return {
          serviceable: false,
          error: data?.meta?.message || "Serviceability check failed",
        };
      }

      const result = data?.result;
      const serviceable =
        result?.serviceable === true ||
        (Array.isArray(result) && result.length > 0);
      const estimatedDays = result?.estimated_delivery_days
        ? parseInt(result.estimated_delivery_days, 10)
        : undefined;
      const codAvailable = result?.cod_available === true;

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
    const { username, api_key } = credentials;

    if (!username || !api_key) {
      return { valid: false, error: "Username and API key are required" };
    }

    try {
      // Use a lightweight serviceability check to validate credentials
      const data = await clickpostFetch(
        username,
        api_key,
        "POST",
        "/check-serviceability/",
        { pickup_pincode: "110001", drop_pincode: "400001", order_type: "REVERSE" },
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid")
        ) {
          return { valid: false, error: "Invalid username or API key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid username or API key" };
      }

      if (data?.meta?.status === 401 || data?.meta?.status === 403) {
        return { valid: false, error: "Invalid username or API key" };
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
    const { username, api_key } = credentials;

    try {
      const data = await clickpostFetch(
        username,
        api_key,
        "POST",
        "/cancel-order/",
        { waybill: awb },
      );

      if (data?.meta?.status === 200 || data?.result?.status === "cancelled") {
        return { success: true };
      }

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (lower.includes("success") || lower.includes("cancelled") || lower.includes("canceled")) {
          return { success: true };
        }
      }

      const errMsg =
        data?.meta?.message ||
        data?.result?.error ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel ClickPost pickup",
      };
    }
  }
}
