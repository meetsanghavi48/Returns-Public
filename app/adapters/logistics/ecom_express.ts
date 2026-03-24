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
// Auth: username + password passed in request body (form data or JSON).
// Workflow: Generate AWBs -> Pincode check -> Manifest/Create -> Track -> NDR
// Contact: Software.support@ecomexpress.in for API credentials.

const API_BASE = "https://api.ecomexpress.in";
const API_BASE_STAGING = "https://clbeta.ecomexpress.in";

function getBase(credentials: Record<string, string>): string {
  return credentials.useSandbox === "true" ? API_BASE_STAGING : API_BASE;
}

async function ecomFetch(
  baseUrl: string,
  path: string,
  formData: Record<string, string>,
): Promise<any> {
  const url = `${baseUrl}${path}`;
  const body = new URLSearchParams(formData);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Ecom Express sometimes returns XML or plain text
    return { raw: text, status: response.status };
  }
}

async function ecomFetchJSON(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<any> {
  const url = `${baseUrl}${path}`;

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
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

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
   * Step 1: POST /apiv2/fetch_awb/ — get an AWB number
   * Step 2: POST /apiv2/manifest_awb/ — create the shipment with parcel details
   * Docs: https://integration.ecomexpress.in/
   *
   * Parcel fields include: AWB_NUMBER, ORDER_NUMBER, PRODUCT (PPD/COD/REV),
   *   CONSIGNEE, CONSIGNEE_ADDRESS1, DESTINATION_CITY, PINCODE, STATE,
   *   MOBILE, ITEM_DESCRIPTION, PIECES, COLLECTABLE_VALUE, DECLARED_VALUE,
   *   ACTUAL_WEIGHT, LENGTH, BREADTH, HEIGHT, PICKUP_NAME, PICKUP_ADDRESS_LINE1,
   *   RETURN_PINCODE, etc.
   */
  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      // Step 1: Fetch AWB number
      const awbData = await ecomFetch(base, "/apiv2/fetch_awb/", {
        username,
        password,
        count: "1",
        type: "REV", // REV for reverse pickup
      });

      let awbNumber: string | undefined;

      if (awbData?.awb && Array.isArray(awbData.awb) && awbData.awb.length > 0) {
        awbNumber = String(awbData.awb[0]);
      } else if (typeof awbData?.awb === "string") {
        awbNumber = awbData.awb;
      }

      if (!awbNumber) {
        return {
          success: false,
          error:
            awbData?.reason ||
            awbData?.message ||
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

      const manifestPayload = {
        username,
        password,
        json_input: JSON.stringify([
          {
            AWB_NUMBER: awbNumber,
            ORDER_NUMBER: params.orderNumber,
            PRODUCT: "REV", // REV = Reverse pickup
            CONSIGNEE: params.senderName,
            CONSIGNEE_ADDRESS1: params.senderAddress.slice(0, 100),
            CONSIGNEE_ADDRESS2: params.senderAddress.slice(100, 200) || "",
            DESTINATION_CITY: params.senderCity,
            PINCODE: params.senderPincode,
            STATE: params.senderState,
            MOBILE: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
            TELEPHONE: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
            ITEM_DESCRIPTION: itemDesc,
            PIECES: params.items.reduce((sum, i) => sum + i.quantity, 0),
            COLLECTABLE_VALUE:
              params.paymentMode === "cod" ? totalAmount.toFixed(2) : "0",
            DECLARED_VALUE: totalAmount.toFixed(2),
            ACTUAL_WEIGHT: (params.weight / 1000).toFixed(2), // grams -> kg
            LENGTH: params.length || 30,
            BREADTH: params.breadth || 25,
            HEIGHT: params.height || 10,
            PICKUP_NAME: params.receiverName,
            PICKUP_ADDRESS_LINE1: params.receiverAddress.slice(0, 100),
            PICKUP_ADDRESS_LINE2: params.receiverAddress.slice(100, 200) || "",
            PICKUP_PINCODE: params.receiverPincode,
            PICKUP_PHONE: params.receiverPhone
              .replace(/[^0-9]/g, "")
              .slice(-10),
            PICKUP_MOBILE: params.receiverPhone
              .replace(/[^0-9]/g, "")
              .slice(-10),
            RETURN_PINCODE: params.receiverPincode,
            RETURN_NAME: params.receiverName,
            RETURN_ADDRESS_LINE1: params.receiverAddress.slice(0, 100),
            RETURN_PHONE: params.receiverPhone
              .replace(/[^0-9]/g, "")
              .slice(-10),
            RETURN_MOBILE: params.receiverPhone
              .replace(/[^0-9]/g, "")
              .slice(-10),
            DG_SHIPMENT: "false",
          },
        ]),
      };

      const manifestData = await ecomFetch(
        base,
        "/apiv2/manifest_awb/",
        manifestPayload,
      );

      // Check if manifest was successful
      const shipmentResult = Array.isArray(manifestData)
        ? manifestData[0]
        : manifestData;

      if (
        shipmentResult?.success === true ||
        shipmentResult?.status === "Success" ||
        shipmentResult?.shipments?.[0]?.success === true
      ) {
        return {
          success: true,
          awb: awbNumber,
          trackingUrl: `https://ecomexpress.in/tracking/?awb_field=${awbNumber}`,
          rawResponse: { awbData, manifestData },
        };
      }

      // Even if the response structure is unexpected, if we got an AWB and no error,
      // consider it a success
      if (awbNumber && !shipmentResult?.reason && !shipmentResult?.error) {
        return {
          success: true,
          awb: awbNumber,
          trackingUrl: `https://ecomexpress.in/tracking/?awb_field=${awbNumber}`,
          rawResponse: { awbData, manifestData },
        };
      }

      return {
        success: false,
        error:
          shipmentResult?.reason ||
          shipmentResult?.error ||
          "Failed to manifest shipment on Ecom Express",
        rawResponse: { awbData, manifestData },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Ecom Express pickup",
      };
    }
  }

  /**
   * Track a shipment by AWB number.
   * Endpoint: POST /apiv2/track_me/
   * Docs: https://integration.ecomexpress.in/
   *
   * Accepts single or multiple AWB numbers.
   * Response includes scan details with status, location, timestamp.
   */
  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomFetch(base, "/apiv2/track_me/", {
        username,
        password,
        awb: awb,
      });

      // Response can be an array of shipment objects or a single object
      const shipment = Array.isArray(data) ? data[0] : data;

      if (!shipment || shipment?.error) {
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

      const scans: any[] = shipment?.scans || shipment?.scan_details || [];
      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.updated_on || scan.scan_date_time || scan.date || "",
        status: scan.status || scan.scan_status || "",
        statusCode: scan.reason_code || scan.status_code || "",
        location: scan.location || scan.city || "",
        description:
          scan.reason_code_description || scan.status || scan.remarks || "",
      }));

      const currentStatus =
        shipment?.current_status ||
        shipment?.status ||
        (events.length > 0 ? events[0].status : "In Transit");
      const currentStatusCode =
        shipment?.reason_code || shipment?.status_code || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "999";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: shipment?.expected_date || undefined,
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

  /**
   * Check pincode serviceability.
   * Endpoint: POST /apiv2/pincodes/
   * Docs: https://integration.ecomexpress.in/
   *
   * Returns list of serviceable pincodes with city, state, active status,
   * and route codes.
   */
  async checkServiceability(
    _originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomFetch(base, "/apiv2/pincodes/", {
        username,
        password,
        pincode: destPin,
      });

      // Response is typically an array of pincode objects
      const pincodes = Array.isArray(data) ? data : data?.pincodes || [];

      if (pincodes.length === 0) {
        return {
          serviceable: false,
          error: `Pincode ${destPin} not serviceable by Ecom Express`,
        };
      }

      const pinInfo = pincodes[0];
      const isActive =
        pinInfo?.active === true ||
        pinInfo?.active === "Y" ||
        pinInfo?.active === "1";

      return {
        serviceable: isActive,
        codAvailable:
          pinInfo?.cod === true ||
          pinInfo?.cod === "Y" ||
          pinInfo?.cod === "1",
      };
    } catch (err: any) {
      return {
        serviceable: false,
        error: err.message || "Failed to check serviceability",
      };
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
      return {
        valid: false,
        error: "Both username and password are required",
      };
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
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate credentials",
      };
    }
  }

  /**
   * Cancel a shipment by AWB number.
   * Endpoint: POST /apiv2/cancel_awb/
   * Docs: https://integration.ecomexpress.in/
   */
  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { username, password } = credentials;
    const base = getBase(credentials);

    try {
      const data = await ecomFetch(base, "/apiv2/cancel_awb/", {
        username,
        password,
        awbs: awb,
      });

      const result = Array.isArray(data) ? data[0] : data;

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
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Ecom Express pickup",
      };
    }
  }
}
