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

const TRACKING_BASE = "https://track.delhivery.com";
const API_BASE = "https://f.delhivery.com";

async function delhiveryFetch(
  token: string,
  method: string,
  baseUrl: string,
  urlPath: string,
  body?: unknown,
  isForm?: boolean,
): Promise<any> {
  const url = baseUrl + urlPath;
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
  };
  const opts: RequestInit = { method, headers };

  if (body) {
    if (isForm) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = `format=json&data=${encodeURIComponent(JSON.stringify(body))}`;
    } else {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class DelhiveryAdapter extends LogisticsAdapter {
  readonly key = "delhivery";
  readonly displayName = "Delhivery";
  readonly region = "india";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=delhivery.com&sz=64";
  readonly meta: AdapterMeta = {
    qcSupport: false,
    setupGuideUrl: "https://www.delhivery.com/developers",
  };

  readonly credentialFields: CredentialField[] = [
    {
      key: "token",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "Enter your Delhivery API token",
      helpText: "Found in Delhivery partner dashboard under API settings",
    },
    {
      key: "pickupLocation",
      label: "Pickup Location Name",
      type: "text",
      required: true,
      placeholder: "e.g. Default Warehouse",
      helpText: "Must match the pickup location name registered in your Delhivery account",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { token, pickupLocation, warehouseName } = credentials;

    const totalQty = params.items.reduce((sum, i) => sum + i.quantity, 0) || 1;
    const totalWeight = Math.max(params.weight / 1000, totalQty * 0.5);
    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";

    const senderAddress = params.senderAddress.slice(0, 200) || "N/A";
    const senderPhone =
      params.senderPhone.replace(/[^0-9]/g, "").slice(-10) || "9999999999";

    const payload = {
      pickup_location: { name: pickupLocation || warehouseName || "Default" },
      shipments: [
        {
          name: params.senderName.slice(0, 50) || "Customer",
          add: senderAddress,
          pin: params.senderPincode || "400001",
          city: params.senderCity || "",
          state: params.senderState || "",
          country: params.senderCountry || "India",
          phone: senderPhone,
          order: `#9${params.orderNumber}_${params.returnId}`,
          payment_mode: "Pickup",
          products_desc: productsDesc,
          hsn_code: "62034200",
          cod_amount: "0",
          order_date: new Date().toISOString().split("T")[0],
          total_amount: String(totalAmount.toFixed(2)),
          seller_name: pickupLocation || warehouseName || "Default",
          seller_inv: `INV-${params.orderNumber}`,
          quantity: totalQty,
          weight: totalWeight,
          shipment_length: params.length || 30,
          shipment_width: params.breadth || 25,
          shipment_height: params.height || 10,
        },
      ],
    };

    try {
      const data = await delhiveryFetch(
        token,
        "POST",
        TRACKING_BASE,
        "/api/cmu/create.json",
        payload,
        true,
      );

      const waybill = data?.packages?.[0]?.waybill || data?.waybill;

      if (waybill) {
        return {
          success: true,
          awb: waybill,
          trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.rmk ||
        data?.packages?.[0]?.remarks ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Delhivery did not return a waybill",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Delhivery pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { token } = credentials;

    try {
      const data = await delhiveryFetch(
        token,
        "GET",
        TRACKING_BASE,
        `/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`,
      );

      const shipment = data?.ShipmentData?.[0]?.Shipment;

      if (!shipment) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: "No shipment data found",
          rawResponse: data,
        };
      }

      const scans: any[] = shipment.Scans || [];
      const events: TrackingEvent[] = scans.map((scan: any) => {
        const s = scan.ScanDetail || scan;
        return {
          timestamp: s.ScanDateTime || s.StatusDateTime || "",
          status: s.Scan || s.Instructions || "",
          statusCode: s.ScanType || s.StatusCode || "",
          location: s.ScannedLocation || s.ScanLocation || "",
          description: s.Instructions || s.Scan || "",
        };
      });

      const currentStatus =
        shipment.Status?.Status || shipment.StatusCode || "In Transit";
      const currentStatusCode =
        shipment.Status?.StatusCode || shipment.StatusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "DL";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: shipment.ExpectedDeliveryDate || undefined,
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
    const { token } = credentials;

    try {
      const data = await delhiveryFetch(
        token,
        "GET",
        TRACKING_BASE,
        `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(destPin)}`,
      );

      const pinEntry =
        data?.delivery_codes?.[0]?.postal_code || data?.delivery_codes?.[0];

      if (!pinEntry) {
        return {
          serviceable: false,
          error: `Pincode ${destPin} not found in Delhivery network`,
        };
      }

      const pickupOk = (pinEntry?.pickup || "").toLowerCase() === "y";
      const codAvailable = (pinEntry?.cod || "").toLowerCase() === "y";
      const estimatedDays = pinEntry?.max_days
        ? parseInt(pinEntry.max_days, 10)
        : undefined;

      return {
        serviceable: pickupOk,
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
    const { token, warehousePincode } = credentials;

    if (!token) {
      return { valid: false, error: "API token is required" };
    }

    try {
      // Validate by making a lightweight serviceability check using the warehouse pincode
      const testPin = warehousePincode || "110001";
      const data = await delhiveryFetch(
        token,
        "GET",
        TRACKING_BASE,
        `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(testPin)}`,
      );

      // If we get an auth error or no data structure, credentials are invalid
      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid token")
        ) {
          return { valid: false, error: "Invalid API token" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API token" };
      }

      // Successful response means the token works
      if (data?.delivery_codes !== undefined) {
        return { valid: true };
      }

      // If we got some response but it's not what we expected, token might still be valid
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
    const { token } = credentials;

    try {
      const data = await delhiveryFetch(
        token,
        "POST",
        API_BASE,
        "/api/p/edit",
        {
          waybill: awb,
          cancellation: true,
        },
      );

      // Delhivery returns status in the response
      if (
        data?.status === true ||
        data?.status === "true" ||
        data?.success === true
      ) {
        return { success: true };
      }

      // Check if the response indicates the cancellation was processed
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

      const errMsg =
        data?.rmk ||
        data?.error ||
        data?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel pickup",
      };
    }
  }
}
