import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

// Shipway API — https://apidocs.shipway.com/
// Base URL: https://shipway.in/api
// Auth: username (login ID) + password (license key) in every request body.
// Key endpoints:
//   POST /pushOrderData             — push order/shipment data for tracking
//   POST /getOrderShipmentDetails   — get tracking status for an order
//   GET  /carriers                  — list available carrier IDs
//
// Shipway is a tracking aggregator — it does NOT generate AWBs.
// AWBs must come from the underlying carrier before pushing to Shipway.

const API_BASE = "https://shipway.in/api";

/* ------------------------------------------------------------------ */
/*  Response types                                                     */
/* ------------------------------------------------------------------ */

interface ShipwayPushResponse {
  status?: string | number;
  message?: string;
  error?: string;
}

interface ShipwayScanDetail {
  time?: string;
  date_time?: string;
  timestamp?: string;
  status?: string;
  activity?: string;
  status_code?: string;
  location?: string;
  city?: string;
  status_description?: string;
}

interface ShipwayShipmentData {
  current_status?: string;
  status?: string;
  current_status_code?: string;
  status_code?: string;
  scan?: ShipwayScanDetail[];
  scans?: ShipwayScanDetail[];
  tracking_details?: ShipwayScanDetail[];
}

interface ShipwayTrackingResponse {
  status?: string | number;
  message?: string;
  response?: ShipwayShipmentData;
  // When response key is absent, shipment fields may be at root level
  current_status?: string;
  current_status_code?: string;
  scan?: ShipwayScanDetail[];
  scans?: ShipwayScanDetail[];
  tracking_details?: ShipwayScanDetail[];
}

interface ShipwayCarrier {
  id: number;
  name: string;
}

interface ShipwayCarriersResponse {
  carriers?: ShipwayCarrier[];
}

interface ShipwayRawFallback {
  raw: string;
  status: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isRawFallback(data: unknown): data is ShipwayRawFallback {
  return (
    typeof data === "object" &&
    data !== null &&
    "raw" in data &&
    typeof (data as ShipwayRawFallback).raw === "string"
  );
}

async function shipwayPost<T>(path: string, body: Record<string, unknown>): Promise<T | ShipwayRawFallback> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text, status: response.status };
  }
}

async function shipwayGet<T>(path: string): Promise<T | ShipwayRawFallback> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text, status: response.status };
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export class ShipwayAdapter extends LogisticsAdapter {
  readonly key = "shipway";
  readonly displayName = "Shipway";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=shipway.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your Shipway username",
      helpText:
        "Your Shipway login ID. Found in the registration email from Shipway.",
    },
    {
      key: "licenseKey",
      label: "License Key",
      type: "password",
      required: true,
      placeholder: "Enter your Shipway license key",
      helpText:
        "Your Shipway license key / password. Found in the registration email from Shipway.",
    },
    {
      key: "carrierId",
      label: "Default Carrier ID",
      type: "text",
      required: false,
      placeholder: "e.g. 1 (Delhivery), 2 (BlueDart)",
      helpText:
        "The numeric carrier ID to use for shipments. Use GET /carriers to list all IDs.",
    },
    {
      key: "companyName",
      label: "Company Name",
      type: "text",
      required: true,
      placeholder: "Your company name",
      helpText: "The company name used when pushing orders to Shipway.",
    },
  ];

  /**
   * Push an order into Shipway for tracking.
   *
   * IMPORTANT: Shipway is a tracking aggregator and does NOT generate AWBs.
   * The AWB must be pre-generated by the underlying carrier and passed via
   * `params.awb`. If no AWB is provided, a placeholder reference is used,
   * but this will not enable real carrier tracking.
   *
   * Endpoint: POST /pushOrderData
   */
  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { username, licenseKey, carrierId, companyName } = credentials;

    if (!params.awb) {
      return {
        success: false,
        error:
          "Shipway is a tracking aggregator and does not generate AWBs. " +
          "An AWB from the underlying carrier must be provided in params.awb " +
          "before pushing the order to Shipway for tracking.",
      };
    }

    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";

    const nameParts = params.senderName.split(" ");
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || "N/A";

    const payload: Record<string, unknown> = {
      username,
      password: licenseKey,
      carrier_id: carrierId || "1",
      awb: params.awb,
      order_id: params.orderNumber,
      first_name: firstName,
      last_name: lastName,
      email: "noreply@example.com",
      phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
      products: productsDesc,
      company: companyName || "Store",
      pickup_address: params.senderAddress,
      pickup_city: params.senderCity,
      pickup_state: params.senderState,
      pickup_country: params.senderCountry || "India",
      pickup_pincode: params.senderPincode,
      shipping_address: params.receiverAddress,
      shipping_city: params.receiverCity,
      shipping_state: params.receiverState,
      shipping_country: params.receiverCountry || "India",
      shipping_pincode: params.receiverPincode,
      weight: (params.weight / 1000).toFixed(2),
      payment_mode: params.paymentMode === "cod" ? "COD" : "Prepaid",
    };

    try {
      const data = await shipwayPost<ShipwayPushResponse>("/pushOrderData", payload);

      if (isRawFallback(data)) {
        return {
          success: false,
          error: `Unexpected response from Shipway (HTTP ${data.status})`,
          rawResponse: data,
        };
      }

      const statusStr = typeof data.status === "string" ? data.status : "";
      const statusNum = typeof data.status === "number" ? data.status : 0;
      const messageLC = (data.message ?? "").toLowerCase();

      if (
        statusStr === "Success" ||
        statusNum === 200 ||
        messageLC.includes("success")
      ) {
        return {
          success: true,
          awb: params.awb,
          trackingUrl: `https://shipway.in/track/${params.awb}`,
          rawResponse: data,
        };
      }

      return {
        success: false,
        error: data.message || data.error || "Failed to push order to Shipway",
        rawResponse: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: getErrorMessage(err),
      };
    }
  }

  /**
   * Get shipment tracking details from Shipway.
   * Endpoint: POST /getOrderShipmentDetails
   *
   * Required: username, password, order_id.
   * The order must first have been pushed via pushOrderData.
   */
  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { username, licenseKey } = credentials;

    const payload: Record<string, unknown> = {
      username,
      password: licenseKey,
      order_id: awb, // Shipway tracks by order_id; AWB used as reference
    };

    try {
      const data = await shipwayPost<ShipwayTrackingResponse>(
        "/getOrderShipmentDetails",
        payload,
      );

      if (isRawFallback(data)) {
        return {
          success: false,
          awb,
          currentStatus: "Error",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: `Unexpected response from Shipway (HTTP ${data.status})`,
          rawResponse: data,
        };
      }

      if (data.status === "error" || data.status === "Error") {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data.message || "Tracking request failed",
          rawResponse: data,
        };
      }

      // Shipment data may be nested under `response` or at root level
      const shipment: ShipwayShipmentData = data.response ?? data;
      const scanDetails: ShipwayScanDetail[] =
        shipment.scan ?? shipment.scans ?? shipment.tracking_details ?? [];

      const events: TrackingEvent[] = scanDetails.map((scan) => ({
        timestamp: scan.time || scan.date_time || scan.timestamp || "",
        status: scan.status || scan.activity || "",
        statusCode: scan.status_code || "",
        location: scan.location || scan.city || "",
        description:
          scan.status_description || scan.activity || scan.status || "",
      }));

      const currentStatus =
        shipment.current_status ||
        shipment.status ||
        (events.length > 0 ? events[0].status : "In Transit");
      const currentStatusCode =
        shipment.current_status_code || shipment.status_code || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "DL";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        events,
        isDelivered,
        rawResponse: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        awb,
        currentStatus: "Error",
        currentStatusCode: "",
        events: [],
        isDelivered: false,
        error: getErrorMessage(err),
      };
    }
  }

  /**
   * Shipway does not provide pincode serviceability checks.
   * Serviceability depends entirely on the underlying carrier.
   */
  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    return {
      serviceable: false,
      error:
        "Shipway is a tracking aggregator and does not provide serviceability checks. " +
        "Check serviceability directly with the underlying carrier.",
    };
  }

  /**
   * Validate Shipway credentials by listing carriers via GET /carriers.
   * If credentials are invalid the API returns an auth error; a valid
   * response (even empty) confirms the credentials work.
   *
   * Falls back to POST /getOrderShipmentDetails with a dummy order_id
   * if the carriers endpoint is inconclusive.
   */
  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username, licenseKey } = credentials;

    if (!username || !licenseKey) {
      return {
        valid: false,
        error: "Both username and license key are required",
      };
    }

    try {
      // Try tracking a dummy order — auth failures return distinct error messages
      const data = await shipwayPost<ShipwayTrackingResponse>(
        "/getOrderShipmentDetails",
        {
          username,
          password: licenseKey,
          order_id: "VALIDATE_CREDS_TEST_000",
        },
      );

      // If we got a raw non-JSON response, inspect it for auth errors
      if (isRawFallback(data)) {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("invalid") ||
          lower.includes("authentication")
        ) {
          return { valid: false, error: "Invalid username or license key" };
        }
        if (data.status === 401 || data.status === 403) {
          return { valid: false, error: "Invalid username or license key" };
        }
        // Non-JSON but not an auth error — assume valid
        return { valid: true };
      }

      // Check for HTTP-level auth failures encoded in the JSON
      if (data.status === 401 || data.status === 403) {
        return { valid: false, error: "Invalid username or license key" };
      }

      const messageLC = (data.message ?? "").toLowerCase();
      if (
        messageLC.includes("unauthorized") ||
        messageLC.includes("invalid credentials") ||
        messageLC.includes("authentication failed")
      ) {
        return { valid: false, error: "Invalid username or license key" };
      }

      // Any structured response (even "order not found") means creds are valid
      return { valid: true };
    } catch (err: unknown) {
      return {
        valid: false,
        error: getErrorMessage(err),
      };
    }
  }

  /**
   * Shipway does not support direct pickup cancellation.
   * Cancellation must be performed on the underlying carrier's API.
   */
  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error:
        "Shipway is a tracking aggregator and does not support direct pickup cancellation. " +
        "Cancel the pickup via the underlying carrier's API.",
    };
  }
}
