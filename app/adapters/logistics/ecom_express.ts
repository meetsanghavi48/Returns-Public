import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

// Ecom Express API — https://integration.ecomexpress.in/
// Auth: username + password passed as form-encoded body fields in every request.
// Workflow: Fetch AWB -> Manifest/Create Shipment -> Track -> Cancel
// Contact: Software.support@ecomexpress.in for API credentials.

const API_BASE = "https://api.ecomexpress.in";
const API_BASE_STAGING = "https://clbeta.ecomexpress.in";

// ── API response types ──────────────────────────────────────────────

interface EcomFetchAwbSuccess {
  awb: string[];
}

interface EcomFetchAwbError {
  reason?: string;
  message?: string;
}

type EcomFetchAwbResponse = EcomFetchAwbSuccess | EcomFetchAwbError;

interface EcomManifestShipmentResult {
  success?: boolean;
  status?: string;
  reason?: string;
  error?: string;
  shipments?: Array<{ success: boolean }>;
}

interface EcomTrackingScan {
  updated_on?: string;
  scan_date_time?: string;
  date?: string;
  status?: string;
  scan_status?: string;
  reason_code?: string;
  status_code?: string;
  reason_code_description?: string;
  location?: string;
  city?: string;
  remarks?: string;
}

interface EcomTrackingShipment {
  current_status?: string;
  status?: string;
  reason_code?: string;
  status_code?: string;
  expected_date?: string;
  scans?: EcomTrackingScan[];
  scan_details?: EcomTrackingScan[];
  error?: string;
  reason?: string;
}

interface EcomPincodeInfo {
  city?: string;
  state?: string;
  active?: boolean | string;
  cod?: boolean | string;
}

interface EcomPincodeResponse {
  pincodes?: EcomPincodeInfo[];
}

interface EcomCancelResult {
  success?: boolean;
  status?: string;
  reason?: string;
  error?: string;
  message?: string;
}

interface EcomRawFallback {
  raw: string;
  status: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getBase(credentials: Record<string, string>): string {
  return credentials.useSandbox === "true" ? API_BASE_STAGING : API_BASE;
}

function isRawFallback(data: unknown): data is EcomRawFallback {
  return (
    typeof data === "object" &&
    data !== null &&
    "raw" in data &&
    "status" in data
  );
}

/**
 * POST a form-encoded request to an Ecom Express endpoint.
 * Returns parsed JSON, or a raw-text fallback if the response isn't valid JSON.
 */
async function ecomPost<T>(
  baseUrl: string,
  path: string,
  formData: Record<string, string>,
): Promise<T | EcomRawFallback> {
  const url = `${baseUrl}${path}`;
  const body = new URLSearchParams(formData);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // Ecom Express sometimes returns XML or plain text
    return { raw: text, status: response.status };
  }
}

// ── Adapter ─────────────────────────────────────────────────────────

export class EcomExpressAdapter extends LogisticsAdapter {
  readonly key = "ecom_express";
  readonly displayName = "Ecom Express";
  readonly region = "IN";
  readonly logoUrl = "/images/logistics/ecom_express.png";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your Ecom Express username",
      helpText:
        "Your Ecom Express API username. Contact Software.support@ecomexpress.in to obtain credentials.",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your Ecom Express password",
      helpText: "Your Ecom Express API password.",
    },
    {
      key: "useSandbox",
      label: "Use Sandbox",
      type: "select",
      required: false,
      options: [
        { label: "No (Production)", value: "false" },
        { label: "Yes (Staging)", value: "true" },
      ],
      helpText: "Use beta/staging environment for testing.",
    },
  ];

  /**
   * Fetch a fresh AWB number from Ecom Express, then manifest the shipment.
   *
   * Step 1: POST /apiv2/fetch_awb/  — obtain a reverse-pickup AWB number
   * Step 2: POST /apiv2/manifest_awb/ — create the shipment with parcel details
   */
  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      // Step 1: Fetch AWB number (type=REV for reverse pickup)
      const awbData = await ecomPost<EcomFetchAwbResponse>(
        base,
        "/apiv2/fetch_awb/",
        { username, password, count: "1", type: "REV" },
      );

      if (isRawFallback(awbData)) {
        return {
          success: false,
          error: "Unexpected response from Ecom Express AWB endpoint",
          rawResponse: awbData,
        };
      }

      let awbNumber: string | undefined;

      if ("awb" in awbData && Array.isArray(awbData.awb) && awbData.awb.length > 0) {
        awbNumber = String(awbData.awb[0]);
      }

      if (!awbNumber) {
        const errData = awbData as EcomFetchAwbError;
        return {
          success: false,
          error:
            errData.reason ||
            errData.message ||
            "Failed to fetch AWB number from Ecom Express",
          rawResponse: awbData,
        };
      }

      // Step 2: Manifest the shipment
      const totalAmount = params.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );
      const itemDesc =
        params.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", ")
          .slice(0, 200) || "Return Shipment";

      const phone10 = (raw: string) => raw.replace(/[^0-9]/g, "").slice(-10);

      const shipmentPayload = [
        {
          AWB_NUMBER: awbNumber,
          ORDER_NUMBER: params.orderNumber,
          PRODUCT: "REV",
          CONSIGNEE: params.senderName,
          CONSIGNEE_ADDRESS1: params.senderAddress.slice(0, 100),
          CONSIGNEE_ADDRESS2: params.senderAddress.slice(100, 200) || "",
          DESTINATION_CITY: params.senderCity,
          PINCODE: params.senderPincode,
          STATE: params.senderState,
          MOBILE: phone10(params.senderPhone),
          TELEPHONE: phone10(params.senderPhone),
          ITEM_DESCRIPTION: itemDesc,
          PIECES: params.items.reduce((sum, i) => sum + i.quantity, 0),
          COLLECTABLE_VALUE:
            params.paymentMode === "cod" ? totalAmount.toFixed(2) : "0",
          DECLARED_VALUE: totalAmount.toFixed(2),
          ACTUAL_WEIGHT: (params.weight / 1000).toFixed(2), // grams -> kg
          LENGTH: params.length ?? 30,
          BREADTH: params.breadth ?? 25,
          HEIGHT: params.height ?? 10,
          PICKUP_NAME: params.receiverName,
          PICKUP_ADDRESS_LINE1: params.receiverAddress.slice(0, 100),
          PICKUP_ADDRESS_LINE2: params.receiverAddress.slice(100, 200) || "",
          PICKUP_PINCODE: params.receiverPincode,
          PICKUP_PHONE: phone10(params.receiverPhone),
          PICKUP_MOBILE: phone10(params.receiverPhone),
          RETURN_PINCODE: params.receiverPincode,
          RETURN_NAME: params.receiverName,
          RETURN_ADDRESS_LINE1: params.receiverAddress.slice(0, 100),
          RETURN_PHONE: phone10(params.receiverPhone),
          RETURN_MOBILE: phone10(params.receiverPhone),
          DG_SHIPMENT: "false",
        },
      ];

      const manifestData = await ecomPost<
        EcomManifestShipmentResult | EcomManifestShipmentResult[]
      >(base, "/apiv2/manifest_awb/", {
        username,
        password,
        json_input: JSON.stringify(shipmentPayload),
      });

      if (isRawFallback(manifestData)) {
        // If we got an AWB but manifest returned non-JSON, still surface it
        return {
          success: false,
          error: "Unexpected response from Ecom Express manifest endpoint",
          rawResponse: { awbData, manifestData },
        };
      }

      const shipmentResult: EcomManifestShipmentResult = Array.isArray(manifestData)
        ? manifestData[0]
        : manifestData;

      const trackingUrl = `https://ecomexpress.in/tracking/?awb_field=${awbNumber}`;

      if (
        shipmentResult?.success === true ||
        shipmentResult?.status === "Success" ||
        shipmentResult?.shipments?.[0]?.success === true
      ) {
        return {
          success: true,
          awb: awbNumber,
          trackingUrl,
          rawResponse: { awbData, manifestData },
        };
      }

      // If no explicit error, treat as success (AWB was allocated)
      if (!shipmentResult?.reason && !shipmentResult?.error) {
        return {
          success: true,
          awb: awbNumber,
          trackingUrl,
          rawResponse: { awbData, manifestData },
        };
      }

      return {
        success: false,
        error:
          shipmentResult.reason ||
          shipmentResult.error ||
          "Failed to manifest shipment on Ecom Express",
        rawResponse: { awbData, manifestData },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create Ecom Express pickup";
      return { success: false, error: message };
    }
  }

  /**
   * Track a shipment by AWB number.
   * Endpoint: POST /apiv2/track_me/
   */
  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomPost<EcomTrackingShipment | EcomTrackingShipment[]>(
        base,
        "/apiv2/track_me/",
        { username, password, awb },
      );

      if (isRawFallback(data)) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: "Unexpected response from Ecom Express tracking endpoint",
          rawResponse: data,
        };
      }

      const shipment: EcomTrackingShipment = Array.isArray(data) ? data[0] : data;

      if (!shipment || shipment.error) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: shipment?.error || shipment?.reason || "No tracking data found",
          rawResponse: data,
        };
      }

      const scans: EcomTrackingScan[] =
        shipment.scans || shipment.scan_details || [];

      const events: TrackingEvent[] = scans.map((scan) => ({
        timestamp: scan.updated_on || scan.scan_date_time || scan.date || "",
        status: scan.status || scan.scan_status || "",
        statusCode: scan.reason_code || scan.status_code || "",
        location: scan.location || scan.city || "",
        description:
          scan.reason_code_description || scan.status || scan.remarks || "",
      }));

      const currentStatus =
        shipment.current_status ||
        shipment.status ||
        (events.length > 0 ? events[0].status : "In Transit");
      const currentStatusCode =
        shipment.reason_code || shipment.status_code || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "999";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: shipment.expected_date || undefined,
        events,
        isDelivered,
        rawResponse: data,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to track shipment";
      return {
        success: false,
        awb,
        currentStatus: "Error",
        currentStatusCode: "",
        events: [],
        isDelivered: false,
        error: message,
      };
    }
  }

  /**
   * Check pincode serviceability.
   * Endpoint: POST /apiv2/pincodes/
   */
  async checkServiceability(
    _originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomPost<EcomPincodeInfo[] | EcomPincodeResponse>(
        base,
        "/apiv2/pincodes/",
        { username, password, pincode: destPin },
      );

      if (isRawFallback(data)) {
        return {
          serviceable: false,
          error: "Unexpected response from Ecom Express pincodes endpoint",
        };
      }

      const pincodes: EcomPincodeInfo[] = Array.isArray(data)
        ? data
        : (data as EcomPincodeResponse).pincodes || [];

      if (pincodes.length === 0) {
        return {
          serviceable: false,
          error: `Pincode ${destPin} not serviceable by Ecom Express`,
        };
      }

      const pinInfo = pincodes[0];
      const isActive =
        pinInfo.active === true ||
        pinInfo.active === "Y" ||
        pinInfo.active === "1";

      return {
        serviceable: isActive,
        codAvailable:
          pinInfo.cod === true ||
          pinInfo.cod === "Y" ||
          pinInfo.cod === "1",
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to check serviceability";
      return { serviceable: false, error: message };
    }
  }

  /**
   * Validate Ecom Express credentials by making a lightweight pincode check.
   */
  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username, password } = credentials;

    if (!username || !password) {
      return { valid: false, error: "Both username and password are required" };
    }

    try {
      const result = await this.checkServiceability(
        "110001",
        "110001",
        credentials,
      );

      if (
        result.error?.toLowerCase().includes("unauthorized") ||
        result.error?.toLowerCase().includes("invalid") ||
        result.error?.toLowerCase().includes("authentication")
      ) {
        return { valid: false, error: "Invalid username or password" };
      }

      return { valid: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to validate credentials";
      return { valid: false, error: message };
    }
  }

  /**
   * Cancel a shipment by AWB number.
   * Endpoint: POST /apiv2/cancel_awb/
   */
  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomPost<EcomCancelResult | EcomCancelResult[]>(
        base,
        "/apiv2/cancel_awb/",
        { username, password, awbs: awb },
      );

      if (isRawFallback(data)) {
        return {
          success: false,
          error: "Unexpected response from Ecom Express cancel endpoint",
        };
      }

      const result: EcomCancelResult = Array.isArray(data) ? data[0] : data;

      if (
        result?.success === true ||
        result?.status === "Success" ||
        result?.status?.toLowerCase() === "cancelled"
      ) {
        return { success: true };
      }

      return {
        success: false,
        error:
          result?.reason ||
          result?.error ||
          result?.message ||
          "Cancellation failed",
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel Ecom Express pickup";
      return { success: false, error: message };
    }
  }
}
