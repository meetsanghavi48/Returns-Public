import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

// iThink Logistics API v3 — https://docs.ithinklogistics.com/
// Staging: https://pre-alpha.ithinklogistics.com
// Production order/cancel: https://my.ithinklogistics.com
// Production tracking: https://api.ithinklogistics.com

function getOrderBase(credentials: Record<string, string>): string {
  return credentials.environment === "staging"
    ? "https://pre-alpha.ithinklogistics.com"
    : "https://my.ithinklogistics.com";
}

function getTrackBase(credentials: Record<string, string>): string {
  return credentials.environment === "staging"
    ? "https://pre-alpha.ithinklogistics.com"
    : "https://api.ithinklogistics.com";
}

async function ithinkFetch(baseUrl: string, path: string, body: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
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

export class IThinkAdapter extends LogisticsAdapter {
  readonly key = "ithink";
  readonly displayName = "iThink Logistics";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=ithinklogistics.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      placeholder: "Enter your iThink access token",
      helpText:
        "Credentials provided by the iThink Logistics team. Found in your iThink dashboard.",
    },
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Enter your iThink secret key",
      helpText: "Credentials provided by the iThink Logistics team.",
    },
    {
      key: "pickupAddressId",
      label: "Pickup Address ID",
      type: "text",
      required: true,
      placeholder: "Warehouse ID from iThink dashboard",
      helpText:
        "The pickup_address_id for your warehouse, configured in iThink.",
    },
    {
      key: "returnAddressId",
      label: "Return Address ID",
      type: "text",
      required: true,
      placeholder: "Return warehouse ID from iThink dashboard",
      helpText:
        "The return_address_id for your return warehouse. Can be the same as pickup.",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Production", value: "production" },
        { label: "Staging", value: "staging" },
      ],
      helpText: "Use staging environment (pre-alpha) for testing.",
    },
  ];

  /**
   * Create a reverse pickup order on iThink Logistics.
   * Endpoint: POST /api_v3/order/add.json
   * Docs: https://docs.ithinklogistics.com/doc-add-order/3
   *
   * Max 10 shipments per request, max 40 products per shipment.
   * Response contains per-shipment status with waybill, logistic_name, tracking_url.
   */
  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { accessToken, secretKey, pickupAddressId, returnAddressId } =
      credentials;
    const base = getOrderBase(credentials);

    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const products = params.items.map((item) => ({
      product_name: item.name,
      product_sku: item.sku,
      product_quantity: item.quantity,
      product_price: item.price,
    }));

    const payload = {
      data: {
        access_token: accessToken,
        secret_key: secretKey,
        shipments: [
          {
            waybill: "",
            order: params.orderNumber,
            sub_order: "",
            order_date: new Date().toISOString().replace("T", " ").slice(0, 19),
            total_amount: totalAmount,
            name: params.senderName,
            add: params.senderAddress,
            pin: params.senderPincode,
            city: params.senderCity,
            state: params.senderState,
            country: params.senderCountry || "India",
            phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
            email: "",
            is_billing_same_as_shipping: "yes",
            billing_name: params.receiverName,
            billing_add: params.receiverAddress,
            billing_pin: params.receiverPincode,
            billing_city: params.receiverCity,
            billing_state: params.receiverState,
            billing_country: params.receiverCountry || "India",
            billing_phone: params.receiverPhone
              .replace(/[^0-9]/g, "")
              .slice(-10),
            products,
            shipment_length: params.length || 30,
            shipment_width: params.breadth || 25,
            shipment_height: params.height || 10,
            weight: params.weight / 1000, // grams -> kg
            payment_mode: params.paymentMode === "cod" ? "cod" : "Prepaid",
            cod_amount: params.paymentMode === "cod" ? totalAmount : 0,
            order_type: "reverse",
            pickup_address_id: parseInt(pickupAddressId, 10),
            return_address_id: parseInt(returnAddressId, 10),
          },
        ],
      },
    };

    try {
      const data = await ithinkFetch(base, "/api_v3/order/add.json", payload);

      if (data?.status === "success" && data?.data) {
        const firstKey = Object.keys(data.data)[0];
        const shipment = data.data[firstKey];

        if (shipment?.status === "Success" && shipment?.waybill) {
          return {
            success: true,
            awb: shipment.waybill,
            trackingUrl: shipment.tracking_url || undefined,
            rawResponse: data,
          };
        }

        return {
          success: false,
          error:
            shipment?.remark ||
            data.html_message ||
            "iThink did not return a waybill",
          rawResponse: data,
        };
      }

      return {
        success: false,
        error:
          data?.html_message ||
          data?.message ||
          "Failed to create order on iThink",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create iThink pickup",
      };
    }
  }

  /**
   * Track a shipment by AWB number.
   * Endpoint: POST /api_v2/order/track.json
   * Docs: https://docs.ithinklogistics.com/doc-track-order/2
   *
   * Max 10 AWB numbers per request (comma-separated in awb_number_list).
   * Response keys tracking data by AWB number, includes scan_details array,
   * current_status, current_status_code, and 28+ status codes (UD, DL, CN, RT, etc.).
   */
  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { accessToken, secretKey } = credentials;
    const base = getTrackBase(credentials);

    const payload = {
      data: {
        awb_number_list: awb,
        access_token: accessToken,
        secret_key: secretKey,
      },
    };

    try {
      const data = await ithinkFetch(base, "/api_v2/order/track.json", payload);

      if (data?.status_code !== 200 && data?.status !== "success") {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: data?.html_message || "Tracking request failed",
          rawResponse: data,
        };
      }

      // Tracking data is keyed by AWB number
      const trackData = data?.data?.[awb] || data?.data;

      const scanDetails: any[] = trackData?.scan_details || [];
      const events: TrackingEvent[] = scanDetails.map((scan: any) => ({
        timestamp: scan.date_time || scan.timestamp || "",
        status: scan.status || "",
        statusCode: scan.status_code || "",
        location: scan.location || "",
        description: scan.remarks || scan.status || "",
      }));

      const currentStatus =
        trackData?.current_status ||
        trackData?.last_scan_details?.status ||
        "In Transit";
      const currentStatusCode = trackData?.current_status_code || "";
      const isDelivered =
        currentStatusCode === "DL" ||
        currentStatus.toLowerCase().includes("delivered");

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

  /**
   * Check pincode serviceability.
   * Endpoint: POST /api_v3/pincode/check.json
   * Docs: https://docs.ithinklogistics.com/doc-check-pincode/3
   *
   * Response contains per-carrier serviceability with prepaid/cod/pickup flags (Y/N),
   * district, state_code, and sort_code.
   */
  async checkServiceability(
    _originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { accessToken, secretKey } = credentials;
    const base = getOrderBase(credentials);

    const payload = {
      data: {
        pincode: destPin,
        access_token: accessToken,
        secret_key: secretKey,
      },
    };

    try {
      const data = await ithinkFetch(
        base,
        "/api_v3/pincode/check.json",
        payload,
      );

      if (data?.status !== "success" && data?.status_code !== 200) {
        return {
          serviceable: false,
          error: data?.html_message || `Pincode ${destPin} not serviceable`,
        };
      }

      // Response groups carriers (xpressbees, fedex, delhivery, etc.)
      // with prepaid, cod, pickup fields as "Y" or "N"
      const carriers = data?.data || {};
      let anyServiceable = false;
      let codAvailable = false;

      for (const carrierKey of Object.keys(carriers)) {
        const carrier = carriers[carrierKey];
        if (
          carrier?.prepaid?.toLowerCase() === "y" ||
          carrier?.pickup?.toLowerCase() === "y"
        ) {
          anyServiceable = true;
        }
        if (carrier?.cod?.toLowerCase() === "y") {
          codAvailable = true;
        }
      }

      return {
        serviceable: anyServiceable,
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
    const { accessToken, secretKey } = credentials;

    if (!accessToken || !secretKey) {
      return {
        valid: false,
        error: "Both access token and secret key are required",
      };
    }

    try {
      // Validate by performing a lightweight pincode check
      const result = await this.checkServiceability(
        "110001",
        "110001",
        credentials,
      );

      if (
        result.error?.toLowerCase().includes("unauthorized") ||
        result.error?.toLowerCase().includes("invalid")
      ) {
        return { valid: false, error: "Invalid access token or secret key" };
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
   * Cancel a pickup/order by AWB number.
   * Endpoint: POST /api_v3/order/cancel.json
   * Docs: https://docs.ithinklogistics.com/doc-cancel-order/3
   *
   * Accepts comma-separated AWB numbers (max 100 per request).
   * Response: { status, status_code, data: { "1": { status, remark, refnum } } }
   */
  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { accessToken, secretKey } = credentials;
    const base = getOrderBase(credentials);

    const payload = {
      data: {
        access_token: accessToken,
        secret_key: secretKey,
        awb_numbers: awb,
      },
    };

    try {
      const data = await ithinkFetch(
        base,
        "/api_v3/order/cancel.json",
        payload,
      );

      if (data?.status === "success" && data?.status_code === 200) {
        const firstKey = Object.keys(data?.data || {})[0];
        const result = data?.data?.[firstKey];

        if (result?.status === "Success") {
          return { success: true };
        }

        return {
          success: false,
          error: result?.remark || "Cancellation response unclear",
        };
      }

      return {
        success: false,
        error:
          data?.html_message ||
          data?.message ||
          "Failed to cancel order on iThink",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel iThink pickup",
      };
    }
  }
}
