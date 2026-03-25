import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://apis.usps.com";
const TOKEN_URL = "https://apis.usps.com/oauth2/v3/token";

async function getOAuthToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "tracking labels pickups addresses",
    }).toString(),
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse OAuth token response: ${text.slice(0, 200)}`);
  }

  if (!data?.access_token) {
    throw new Error(
      data?.error_description || data?.error || "Failed to obtain OAuth token",
    );
  }

  return data.access_token;
}

async function uspsFetch(
  token: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = `${API_BASE}${urlPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
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

export class USPSAdapter extends LogisticsAdapter {
  readonly key = "usps";
  readonly displayName = "USPS";
  readonly region = "US";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=usps.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "client_id",
      label: "Client ID",
      type: "password",
      required: true,
      placeholder: "Your USPS API client ID",
      helpText: "Found in the USPS Web Tools developer portal",
    },
    {
      key: "client_secret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "Your USPS API client secret",
      helpText: "Found in the USPS Web Tools developer portal",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { client_id, client_secret } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      const totalWeight = Math.max(
        Math.round(params.weight * 0.035274 * 10) / 10,
        0.1,
      ); // grams to oz
      const totalAmount = params.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );

      // Step 1: Create label
      const labelPayload = {
        fromAddress: {
          firstName: params.senderName.split(" ")[0] || "Customer",
          lastName: params.senderName.split(" ").slice(1).join(" ") || "",
          streetAddress: params.senderAddress.slice(0, 200),
          city: params.senderCity,
          state: params.senderState,
          ZIPCode: params.senderPincode,
          phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
        },
        toAddress: {
          firstName: params.receiverName.split(" ")[0] || "Warehouse",
          lastName: params.receiverName.split(" ").slice(1).join(" ") || "",
          streetAddress: params.receiverAddress.slice(0, 200),
          city: params.receiverCity,
          state: params.receiverState,
          ZIPCode: params.receiverPincode,
          phone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
        },
        packageDescription: {
          weight: totalWeight,
          length: params.length ? Math.round(params.length * 0.3937) : 12, // cm to inches
          width: params.breadth ? Math.round(params.breadth * 0.3937) : 10,
          height: params.height ? Math.round(params.height * 0.3937) : 4,
          mailClass: "PRIORITY_MAIL",
          processingCategory: "NON_MACHINABLE",
          rateIndicator: "SP",
          destinationEntryFacilityType: "NONE",
          priceType: "RETAIL",
        },
        metadata: {
          orderNumber: `${params.orderNumber}_${params.returnId}`,
        },
      };

      const labelData = await uspsFetch(
        token,
        "POST",
        "/labels/v3/label",
        labelPayload,
      );

      const trackingNumber =
        labelData?.trackingNumber || labelData?.tracking_number;
      const labelUrl = labelData?.labelDownloadUrl || labelData?.labelImage;

      if (trackingNumber) {
        // Step 2: Schedule pickup
        let estimatedPickup: string | undefined;
        try {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const pickupDate = tomorrow.toISOString().split("T")[0];

          const pickupPayload = {
            pickupDate,
            pickupAddress: {
              firstName: params.senderName.split(" ")[0] || "Customer",
              lastName: params.senderName.split(" ").slice(1).join(" ") || "",
              streetAddress: params.senderAddress.slice(0, 200),
              city: params.senderCity,
              state: params.senderState,
              ZIPCode: params.senderPincode,
              phone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
            },
            packages: [
              {
                packageType: "OTHER",
                packageCount: 1,
              },
            ],
          };

          const pickupData = await uspsFetch(
            token,
            "POST",
            "/pickup/v3/carrier-pickup",
            pickupPayload,
          );

          estimatedPickup =
            pickupData?.pickupDate || pickupData?.confirmationNumber
              ? pickupDate
              : undefined;
        } catch {
          // Pickup scheduling is optional; label creation succeeded
        }

        return {
          success: true,
          awb: trackingNumber,
          trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
          labelUrl: labelUrl || undefined,
          estimatedPickup,
          rawResponse: labelData,
        };
      }

      const errMsg =
        labelData?.error?.message ||
        labelData?.errors?.[0]?.message ||
        labelData?.message ||
        JSON.stringify(labelData).slice(0, 300);

      return {
        success: false,
        error: errMsg || "USPS did not return a tracking number",
        rawResponse: labelData,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create USPS shipment",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { client_id, client_secret } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      const data = await uspsFetch(
        token,
        "GET",
        `/tracking/v3/tracking/${encodeURIComponent(awb)}?expand=DETAIL`,
      );

      const trackingInfo = data?.trackingNumber
        ? data
        : data?.trackingInfo || data?.tracking;

      if (!trackingInfo) {
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error:
            data?.error?.message ||
            data?.errors?.[0]?.message ||
            "No tracking data found",
          rawResponse: data,
        };
      }

      const scanEvents: any[] =
        trackingInfo?.trackingEvents ||
        trackingInfo?.trackSummary?.concat?.(trackingInfo?.trackDetail || []) ||
        [];
      const events: TrackingEvent[] = scanEvents.map((evt: any) => ({
        timestamp: evt.eventTimestamp || evt.eventDate || "",
        status: evt.eventType || evt.event || "",
        statusCode: evt.eventCode || "",
        location: [evt.eventCity, evt.eventState, evt.eventZIPCode]
          .filter(Boolean)
          .join(", "),
        description: evt.eventType || evt.event || "",
      }));

      const currentStatus =
        trackingInfo?.statusCategory ||
        trackingInfo?.status ||
        events[0]?.status ||
        "In Transit";
      const currentStatusCode =
        trackingInfo?.statusCode || events[0]?.statusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "01";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery:
          trackingInfo?.expectedDeliveryDate ||
          trackingInfo?.expectedDelivery ||
          undefined,
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
    const { client_id, client_secret } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      // Use address validation as a proxy for serviceability
      const payload = {
        streetAddress: "1 Main St",
        city: "",
        state: "",
        ZIPCode: destPin,
      };

      const data = await uspsFetch(
        token,
        "POST",
        "/addresses/v3/address",
        payload,
      );

      if (data?.error || data?.errors) {
        const errorMsg =
          data?.error?.message ||
          data?.errors?.[0]?.message ||
          "Address validation failed";

        // If the ZIP code is not found, the destination is not serviceable
        if (
          errorMsg.toLowerCase().includes("not found") ||
          errorMsg.toLowerCase().includes("invalid")
        ) {
          return {
            serviceable: false,
            error: `ZIP code ${destPin} not serviceable by USPS`,
          };
        }

        return { serviceable: false, error: errorMsg };
      }

      const address = data?.address || data;
      const serviceable = !!address?.ZIPCode || !!address?.zip5;

      return {
        serviceable,
        estimatedDays: undefined,
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
    const { client_id, client_secret } = credentials;

    if (!client_id || !client_secret) {
      return { valid: false, error: "Client ID and client secret are required" };
    }

    try {
      // Validate by attempting to obtain an OAuth token
      await getOAuthToken(client_id, client_secret);
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Invalid client ID or client secret",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { client_id, client_secret } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      // The AWB here is used as the confirmation number for the pickup
      const data = await uspsFetch(
        token,
        "PUT",
        `/pickup/v3/carrier-pickup/${encodeURIComponent(awb)}/cancel`,
      );

      if (
        data?.status === "cancelled" ||
        data?.status === "canceled" ||
        data?.confirmationNumber
      ) {
        return { success: true };
      }

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

      // A response without explicit error on a cancel endpoint typically means success
      if (!data?.error && !data?.errors && data?.status !== 400) {
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
        error: err.message || "Failed to cancel USPS pickup",
      };
    }
  }
}
