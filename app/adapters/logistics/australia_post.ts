import {
  LogisticsAdapter,
  type CredentialField,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
} from "./base";

const API_BASE = "https://digitalapi.auspost.com.au";

async function auspostShippingFetch(
  apiKey: string,
  password: string,
  accountNumber: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = API_BASE + urlPath;
  const basicAuth = btoa(`${apiKey}:${password}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    "Account-Number": accountNumber,
    Accept: "application/json",
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

async function auspostPostageFetch(
  apiKey: string,
  method: string,
  urlPath: string,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "AUTH-KEY": apiKey,
    Accept: "application/json",
  };
  const opts: RequestInit = { method, headers };

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class AustraliaPostAdapter extends LogisticsAdapter {
  readonly key = "australia_post";
  readonly displayName = "Australia Post";
  readonly region = "AU";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=auspost.com.au&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Australia Post API key",
      helpText: "Found in your Australia Post developer portal",
    },
    {
      key: "accountNumber",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your account number",
      helpText: "Your Australia Post shipping account number",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your password",
      helpText: "API password associated with your account",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { apiKey, password, accountNumber } = credentials;

    const totalWeight = Math.max(params.weight / 1000, 0.5);
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";

    const shipmentPayload = {
      shipments: [
        {
          shipment_reference: `RET-${params.orderNumber}-${params.returnId}`,
          customer_reference_1: params.orderNumber,
          customer_reference_2: params.returnId,
          from: {
            name: params.senderName.slice(0, 50) || "Customer",
            lines: [params.senderAddress.slice(0, 200) || "N/A"],
            suburb: params.senderCity || "",
            state: params.senderState || "",
            postcode: params.senderPincode || "2000",
            country: params.senderCountry || "AU",
            phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10) || "0400000000",
          },
          to: {
            name: params.receiverName.slice(0, 50) || "Warehouse",
            lines: [params.receiverAddress.slice(0, 200) || "N/A"],
            suburb: params.receiverCity || "",
            state: params.receiverState || "",
            postcode: params.receiverPincode || "3000",
            country: params.receiverCountry || "AU",
            phone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10) || "0400000000",
          },
          items: [
            {
              item_reference: `ITEM-${params.returnId}`,
              product_id: "7E55",
              length: params.length || 30,
              width: params.breadth || 25,
              height: params.height || 10,
              weight: totalWeight,
              item_description: productsDesc,
              authority_to_leave: false,
              allow_partial_delivery: false,
            },
          ],
        },
      ],
    };

    try {
      const data = await auspostShippingFetch(
        apiKey,
        password,
        accountNumber,
        "POST",
        "/shipping/v1/shipments",
        shipmentPayload,
      );

      const shipment = data?.shipments?.[0];
      const item = shipment?.items?.[0];
      const trackingId = item?.tracking_details?.article_id || item?.article_id || shipment?.shipment_id;

      if (trackingId) {
        // Request label
        let labelUrl: string | undefined;
        try {
          const labelData = await auspostShippingFetch(
            apiKey,
            password,
            accountNumber,
            "POST",
            "/shipping/v1/labels",
            {
              preferences: [{ type: "STANDARD_LABEL", format: "PDF", groups: [{ group: "Parcel Post", layout: "A4-1pp" }] }],
              shipments: [{ shipment_id: shipment?.shipment_id }],
            },
          );
          labelUrl = labelData?.labels?.[0]?.url || undefined;
        } catch {
          // Label generation is optional
        }

        return {
          success: true,
          awb: trackingId,
          trackingUrl: `https://auspost.com.au/mypost/track/#/details/${trackingId}`,
          labelUrl,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.errors?.[0]?.message ||
        shipment?.errors?.[0]?.message ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Australia Post did not return a tracking ID",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Australia Post shipment",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { apiKey, password, accountNumber } = credentials;

    try {
      const data = await auspostShippingFetch(
        apiKey,
        password,
        accountNumber,
        "GET",
        `/shipping/v1/track?tracking_ids=${encodeURIComponent(awb)}`,
      );

      const result = data?.tracking_results?.[0];

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

      const trackableItems = result?.trackable_items || [];
      const item = trackableItems[0] || {};
      const scans: any[] = item?.events || [];

      const events: TrackingEvent[] = scans.map((event: any) => ({
        timestamp: event.date || "",
        status: event.description || "",
        statusCode: event.event_code || "",
        location: event.location || "",
        description: event.description || "",
      }));

      const currentStatus = item?.status || events[0]?.status || "In Transit";
      const currentStatusCode = item?.status_code || events[0]?.statusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "DEL";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: item?.expected_delivery_date || undefined,
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

    try {
      const data = await auspostPostageFetch(
        apiKey,
        "GET",
        `/postage/parcel/domestic/service.json?from_postcode=${encodeURIComponent(originPin)}&to_postcode=${encodeURIComponent(destPin)}&length=30&width=25&height=10&weight=1`,
      );

      const services = data?.services?.service || [];

      if (!services.length) {
        return {
          serviceable: false,
          error: `No services available between ${originPin} and ${destPin}`,
        };
      }

      // Find the cheapest service and get estimated days
      const firstService = services[0];
      const estimatedDays = firstService?.max_extra_cover
        ? undefined
        : parseInt(firstService?.delivery_time || "", 10) || undefined;

      return {
        serviceable: true,
        estimatedDays,
        codAvailable: false, // Australia Post does not offer COD
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
      const data = await auspostPostageFetch(
        apiKey,
        "GET",
        "/postage/parcel/domestic/service.json?from_postcode=2000&to_postcode=3000&length=30&width=25&height=10&weight=1",
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid")
        ) {
          return { valid: false, error: "Invalid API key" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }

      if (data?.services || data?.error === undefined) {
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
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    // Australia Post does not provide a direct pickup cancellation API.
    // Shipments can be voided by not lodging them. Once lodged, contact support.
    try {
      return {
        success: false,
        error:
          "Australia Post does not support automatic pickup cancellation. " +
          `Please contact Australia Post support to cancel shipment ${awb}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel pickup",
      };
    }
  }
}
