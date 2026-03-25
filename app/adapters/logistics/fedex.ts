import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const BASE_URL = "https://apis.fedex.com";
const SANDBOX_BASE_URL = "https://apis-sandbox.fedex.com";
const TOKEN_URL = "https://apis.fedex.com/oauth/token";
const SANDBOX_TOKEN_URL = "https://apis-sandbox.fedex.com/oauth/token";

// Simple in-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(
  clientId: string,
  clientSecret: string,
  sandbox?: boolean,
): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : TOKEN_URL;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.errors?.[0]?.message || data.error_description || "Failed to obtain FedEx OAuth token",
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.token;
}

async function fedexFetch(
  token: string,
  method: string,
  urlPath: string,
  body?: unknown,
  sandbox?: boolean,
): Promise<any> {
  const baseUrl = sandbox ? SANDBOX_BASE_URL : BASE_URL;
  const url = baseUrl + urlPath;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const opts: RequestInit = { method, headers };

  if (body) {
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

export class FedExAdapter extends LogisticsAdapter {
  readonly key = "fedex";
  readonly displayName = "FedEx";
  readonly region = "global";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=fedex.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "client_id",
      label: "Client ID",
      type: "password",
      required: true,
      placeholder: "Enter your FedEx Client ID",
      helpText: "Found in FedEx Developer Portal under API credentials",
    },
    {
      key: "client_secret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "Enter your FedEx Client Secret",
      helpText: "Found in FedEx Developer Portal under API credentials",
    },
    {
      key: "account_number",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your FedEx account number",
      helpText: "Your FedEx shipping account number",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { client_id, client_secret, account_number } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      const totalWeight = Math.max(params.weight / 1000, 0.5); // kg
      const productsDesc =
        params.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", ")
          .slice(0, 200) || "Return Shipment";

      // First create the shipment to get an AWB/tracking number
      const shipmentPayload = {
        labelResponseOptions: "LABEL",
        requestedShipment: {
          shipper: {
            contact: {
              personName: params.senderName.slice(0, 50) || "Customer",
              phoneNumber: params.senderPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
            },
            address: {
              streetLines: [params.senderAddress.slice(0, 200)],
              city: params.senderCity,
              stateOrProvinceCode: params.senderState.slice(0, 2).toUpperCase(),
              postalCode: params.senderPincode,
              countryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
            },
          },
          recipients: [
            {
              contact: {
                personName: params.receiverName.slice(0, 50) || "Warehouse",
                phoneNumber:
                  params.receiverPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
              },
              address: {
                streetLines: [params.receiverAddress.slice(0, 200)],
                city: params.receiverCity,
                stateOrProvinceCode: params.receiverState.slice(0, 2).toUpperCase(),
                postalCode: params.receiverPincode,
                countryCode: params.receiverCountry.slice(0, 2).toUpperCase() || "US",
              },
            },
          ],
          shippingChargesPayment: {
            paymentType: "SENDER",
            payor: {
              responsibleParty: {
                accountNumber: { value: account_number },
              },
            },
          },
          serviceType: "FEDEX_GROUND",
          packagingType: "YOUR_PACKAGING",
          pickupType: "USE_SCHEDULED_PICKUP",
          labelSpecification: {
            imageType: "PDF",
            labelStockType: "PAPER_4X6",
          },
          requestedPackageLineItems: [
            {
              weight: {
                units: "KG",
                value: totalWeight,
              },
              dimensions: {
                length: params.length || 30,
                width: params.breadth || 25,
                height: params.height || 10,
                units: "CM",
              },
              itemDescription: productsDesc,
            },
          ],
        },
        accountNumber: { value: account_number },
      };

      const shipData = await fedexFetch(token, "POST", "/ship/v1/shipments", shipmentPayload);

      const trackingNumber =
        shipData?.output?.transactionShipments?.[0]?.masterTrackingNumber?.trackingNumber;
      const labelUrl =
        shipData?.output?.transactionShipments?.[0]?.pieceResponses?.[0]?.packageDocuments?.[0]
          ?.url;

      if (!trackingNumber) {
        const errMsg =
          shipData?.errors?.[0]?.message ||
          shipData?.output?.alerts?.[0]?.message ||
          JSON.stringify(shipData).slice(0, 300);
        return {
          success: false,
          error: errMsg || "FedEx did not return a tracking number",
          rawResponse: shipData,
        };
      }

      // Now schedule the pickup
      const pickupPayload = {
        associatedAccountNumber: { value: account_number },
        originDetail: {
          pickupAddressType: "ACCOUNT",
          pickupLocation: {
            contact: {
              personName: params.senderName.slice(0, 50) || "Customer",
              phoneNumber: params.senderPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
            },
            address: {
              streetLines: [params.senderAddress.slice(0, 200)],
              city: params.senderCity,
              stateOrProvinceCode: params.senderState.slice(0, 2).toUpperCase(),
              postalCode: params.senderPincode,
              countryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
            },
          },
          readyDateTimestamp: new Date().toISOString(),
          packageCount: 1,
        },
        carrierCode: "FDXG",
      };

      const pickupData = await fedexFetch(token, "POST", "/pickup/v1/pickups", pickupPayload);
      const estimatedPickup = pickupData?.output?.pickupConfirmationCode || undefined;

      return {
        success: true,
        awb: trackingNumber,
        trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
        labelUrl: labelUrl || undefined,
        estimatedPickup,
        rawResponse: { shipment: shipData, pickup: pickupData },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create FedEx pickup",
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

      const payload = {
        includeDetailedScans: true,
        trackingInfo: [
          {
            trackingNumberInfo: {
              trackingNumber: awb,
            },
          },
        ],
      };

      const data = await fedexFetch(token, "POST", "/track/v1/trackingnumbers", payload);

      const trackResult = data?.output?.completeTrackResults?.[0]?.trackResults?.[0];

      if (!trackResult) {
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

      const scanEvents: any[] = trackResult.scanEvents || [];
      const events: TrackingEvent[] = scanEvents.map((event: any) => ({
        timestamp: event.date || "",
        status: event.derivedStatus || event.eventDescription || "",
        statusCode: event.eventType || "",
        location: event.scanLocation?.city
          ? `${event.scanLocation.city}, ${event.scanLocation.stateOrProvinceCode || ""} ${event.scanLocation.countryCode || ""}`
          : "",
        description: event.eventDescription || "",
      }));

      const latestStatus = trackResult.latestStatusDetail || {};
      const currentStatus =
        latestStatus.description || latestStatus.statusByLocale || "In Transit";
      const currentStatusCode = latestStatus.code || "";
      const isDelivered =
        currentStatusCode === "DL" || currentStatus.toLowerCase().includes("delivered");

      const estimatedDelivery =
        trackResult.estimatedDeliveryTimeWindow?.window?.ends ||
        trackResult.standardTransitTimeWindow?.window?.ends ||
        undefined;

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery,
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
    const { client_id, client_secret, account_number } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      const payload = {
        accountNumber: { value: account_number },
        requestedShipment: {
          shipper: {
            address: { postalCode: originPin, countryCode: "US" },
          },
          recipients: [
            {
              address: { postalCode: destPin, countryCode: "US" },
            },
          ],
          requestedPackageLineItems: [
            {
              weight: { units: "KG", value: 1 },
            },
          ],
        },
      };

      const data = await fedexFetch(
        token,
        "POST",
        "/availability/v1/packageandserviceoptions",
        payload,
      );

      const services = data?.output?.packageOptions || data?.output?.serviceOptions || [];

      if (services.length > 0) {
        // Find the fastest service to estimate days
        const transitDays = services[0]?.transitTime?.value
          ? parseInt(services[0].transitTime.value, 10)
          : undefined;

        return {
          serviceable: true,
          estimatedDays: transitDays || undefined,
          codAvailable: false, // FedEx COD requires separate setup
        };
      }

      if (data?.errors?.length > 0) {
        return {
          serviceable: false,
          error: data.errors[0].message || "Route not serviceable",
        };
      }

      return {
        serviceable: false,
        error: "No service options available for this route",
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
      return { valid: false, error: "Client ID and Client Secret are required" };
    }

    try {
      await getOAuthToken(client_id, client_secret);
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate FedEx credentials",
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

      const payload = {
        associatedAccountNumber: { value: credentials.account_number },
        pickupConfirmationCode: awb,
        scheduledDate: new Date().toISOString().split("T")[0],
        location: "",
      };

      const data = await fedexFetch(token, "POST", "/pickup/v1/pickups/cancel", payload);

      if (data?.output?.pickupConfirmationCode || data?.output?.cancelConfirmationMessage) {
        return { success: true };
      }

      if (data?.errors?.length > 0) {
        return {
          success: false,
          error: data.errors[0].message || "Failed to cancel FedEx pickup",
        };
      }

      // If no explicit error, assume success
      if (!data?.errors) {
        return { success: true };
      }

      return {
        success: false,
        error: "Cancellation response unclear",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel FedEx pickup",
      };
    }
  }
}
