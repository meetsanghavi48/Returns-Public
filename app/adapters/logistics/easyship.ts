import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://api.easyship.com/2023-01";

async function easyshipFetch(
  apiToken: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = `${API_BASE}${urlPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
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

export class EasyshipAdapter extends LogisticsAdapter {
  readonly key = "easyship";
  readonly displayName = "Easyship";
  readonly region = "global";
  readonly logoUrl = "/logos/easyship.png";

  readonly credentialFields: CredentialField[] = [
    {
      key: "api_token",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "Your Easyship API token",
      helpText: "Found in Easyship dashboard under Settings > API",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { api_token } = credentials;

    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const payload = {
      origin_address: {
        contact_name: params.senderName.slice(0, 50) || "Customer",
        contact_phone: params.senderPhone,
        line_1: params.senderAddress.slice(0, 200),
        city: params.senderCity,
        state: params.senderState,
        postal_code: params.senderPincode,
        country_alpha2: params.senderCountry || "US",
      },
      destination_address: {
        contact_name: params.receiverName.slice(0, 50) || "Warehouse",
        contact_phone: params.receiverPhone,
        line_1: params.receiverAddress.slice(0, 200),
        city: params.receiverCity,
        state: params.receiverState,
        postal_code: params.receiverPincode,
        country_alpha2: params.receiverCountry || "US",
      },
      parcels: [
        {
          total_actual_weight: params.weight / 1000, // convert grams to kg
          box: {
            length: params.length || 30,
            width: params.breadth || 25,
            height: params.height || 10,
          },
          items: params.items.map((item) => ({
            description: item.name,
            sku: item.sku,
            quantity: item.quantity,
            declared_currency: "USD",
            declared_customs_value: item.price,
            actual_weight: (params.weight / 1000 / params.items.length).toFixed(2),
          })),
        },
      ],
      metadata: {
        platform_order_number: `${params.orderNumber}_${params.returnId}`,
      },
      order_data: {
        platform_order_number: params.orderNumber,
        order_tag_list: ["return"],
        buyer_selected_courier_name: null,
      },
      regulatory: {
        is_return: true,
      },
      insurance: {
        is_insured: false,
      },
      incoterms: "DDU",
      set_as_residential: true,
      buy_label: true,
    };

    try {
      const data = await easyshipFetch(
        api_token,
        "POST",
        "/shipments",
        payload,
      );

      const shipment = data?.shipment;
      const trackingNumber =
        shipment?.tracking_number ||
        shipment?.trackings?.[0]?.tracking_number;

      if (shipment?.easyship_shipment_id && trackingNumber) {
        return {
          success: true,
          awb: trackingNumber,
          trackingUrl: shipment?.tracking_page_url || undefined,
          labelUrl: shipment?.label_url || shipment?.shipping_documents?.label?.url || undefined,
          estimatedPickup: shipment?.pickup_date || undefined,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.error?.message ||
        data?.errors?.[0]?.message ||
        data?.message ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Easyship did not return a tracking number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Easyship shipment",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { api_token } = credentials;

    try {
      // First get the shipment by tracking number
      const searchData = await easyshipFetch(
        api_token,
        "GET",
        `/shipments?tracking_number=${encodeURIComponent(awb)}`,
      );

      const shipment = searchData?.shipments?.[0];

      if (!shipment) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: "No shipment found for this tracking number",
          rawResponse: searchData,
        };
      }

      // Get detailed tracking
      const trackingData = await easyshipFetch(
        api_token,
        "GET",
        `/shipments/${shipment.easyship_shipment_id}/tracking`,
      );

      const checkpoints: any[] =
        trackingData?.tracking?.checkpoints ||
        trackingData?.checkpoints ||
        [];
      const events: TrackingEvent[] = checkpoints.map((cp: any) => ({
        timestamp: cp.checkpoint_time || cp.created_at || "",
        status: cp.message || cp.primary_status || "",
        statusCode: cp.tag || cp.status_code || "",
        location: cp.location || cp.city || "",
        description: cp.message || cp.sub_status || "",
      }));

      const currentStatus =
        trackingData?.tracking?.status ||
        shipment?.tracking_status ||
        "In Transit";
      const currentStatusCode =
        trackingData?.tracking?.status_code || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "Delivered";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery:
          trackingData?.tracking?.estimated_delivery_date ||
          shipment?.delivery_date ||
          undefined,
        events,
        isDelivered,
        rawResponse: trackingData,
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
    const { api_token } = credentials;

    try {
      const payload = {
        origin_postal_code: originPin,
        destination_postal_code: destPin,
        origin_country_alpha2: "US",
        destination_country_alpha2: "US",
        parcels: [
          {
            total_actual_weight: 1,
            box: { length: 30, width: 25, height: 10 },
            items: [
              {
                quantity: 1,
                declared_currency: "USD",
                declared_customs_value: 10,
                actual_weight: 1,
              },
            ],
          },
        ],
      };

      const data = await easyshipFetch(
        api_token,
        "POST",
        "/rates",
        payload,
      );

      if (data?.error || data?.errors) {
        return {
          serviceable: false,
          error:
            data?.error?.message ||
            data?.errors?.[0]?.message ||
            "Serviceability check failed",
        };
      }

      const rates = data?.rates || [];
      const serviceable = Array.isArray(rates) && rates.length > 0;

      let estimatedDays: number | undefined;
      if (serviceable && rates[0]?.max_delivery_time) {
        estimatedDays = parseInt(rates[0].max_delivery_time, 10);
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
    const { api_token } = credentials;

    if (!api_token) {
      return { valid: false, error: "API token is required" };
    }

    try {
      // Use a lightweight endpoint to validate the token
      const data = await easyshipFetch(
        api_token,
        "GET",
        "/shipments?per_page=1",
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid")
        ) {
          return { valid: false, error: "Invalid API token" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API token" };
      }

      if (data?.error?.code === 401 || data?.error?.code === 403) {
        return { valid: false, error: "Invalid API token" };
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
    const { api_token } = credentials;

    try {
      // First find the shipment ID from the tracking number
      const searchData = await easyshipFetch(
        api_token,
        "GET",
        `/shipments?tracking_number=${encodeURIComponent(awb)}`,
      );

      const shipment = searchData?.shipments?.[0];

      if (!shipment?.easyship_shipment_id) {
        return {
          success: false,
          error: "No shipment found for this tracking number",
        };
      }

      const data = await easyshipFetch(
        api_token,
        "POST",
        `/shipments/${shipment.easyship_shipment_id}/cancel`,
      );

      if (
        data?.shipment?.status === "cancelled" ||
        data?.success === true ||
        data?.message?.toLowerCase().includes("cancel")
      ) {
        return { success: true };
      }

      // A response without error typically indicates success
      if (!data?.error && !data?.errors && !data?.raw) {
        return { success: true };
      }

      const errMsg =
        data?.error?.message ||
        data?.errors?.[0]?.message ||
        data?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Easyship shipment",
      };
    }
  }
}
