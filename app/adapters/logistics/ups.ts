import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const BASE_URL = "https://onlinetools.ups.com";
const TOKEN_URL = "https://onlinetools.ups.com/security/v1/oauth/token";

// Simple in-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  // UPS uses Basic Auth (base64 of client_id:client_secret) for token requests
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }).toString(),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.response?.errors?.[0]?.message ||
        data.error_description ||
        "Failed to obtain UPS OAuth token",
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.token;
}

async function upsFetch(
  token: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = BASE_URL + urlPath;
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

export class UPSAdapter extends LogisticsAdapter {
  readonly key = "ups";
  readonly displayName = "UPS";
  readonly region = "global";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=ups.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "client_id",
      label: "Client ID",
      type: "password",
      required: true,
      placeholder: "Enter your UPS Client ID",
      helpText: "Found in UPS Developer Portal under App credentials",
    },
    {
      key: "client_secret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "Enter your UPS Client Secret",
      helpText: "Found in UPS Developer Portal under App credentials",
    },
    {
      key: "account_number",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your UPS account number",
      helpText: "Your 6-digit UPS shipper number",
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
      const totalAmount = params.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );
      const productsDesc =
        params.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", ")
          .slice(0, 200) || "Return Shipment";

      // Create shipment to get tracking number
      const shipPayload = {
        ShipmentRequest: {
          Request: {
            SubVersion: "2409",
            RequestOption: "nonvalidate",
            TransactionReference: { CustomerContext: params.returnId },
          },
          Shipment: {
            Description: productsDesc,
            Shipper: {
              Name: params.senderName.slice(0, 35) || "Customer",
              ShipperNumber: account_number,
              Phone: {
                Number: params.senderPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
              },
              Address: {
                AddressLine: [params.senderAddress.slice(0, 100)],
                City: params.senderCity.slice(0, 30),
                StateProvinceCode: params.senderState.slice(0, 5).toUpperCase(),
                PostalCode: params.senderPincode,
                CountryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
              },
            },
            ShipTo: {
              Name: params.receiverName.slice(0, 35) || "Warehouse",
              Phone: {
                Number:
                  params.receiverPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
              },
              Address: {
                AddressLine: [params.receiverAddress.slice(0, 100)],
                City: params.receiverCity.slice(0, 30),
                StateProvinceCode: params.receiverState.slice(0, 5).toUpperCase(),
                PostalCode: params.receiverPincode,
                CountryCode: params.receiverCountry.slice(0, 2).toUpperCase() || "US",
              },
            },
            ShipFrom: {
              Name: params.senderName.slice(0, 35) || "Customer",
              Address: {
                AddressLine: [params.senderAddress.slice(0, 100)],
                City: params.senderCity.slice(0, 30),
                StateProvinceCode: params.senderState.slice(0, 5).toUpperCase(),
                PostalCode: params.senderPincode,
                CountryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
              },
            },
            PaymentInformation: {
              ShipmentCharge: [
                {
                  Type: "01",
                  BillShipper: { AccountNumber: account_number },
                },
              ],
            },
            Service: { Code: "03", Description: "UPS Ground" },
            Package: [
              {
                PackagingType: { Code: "02", Description: "Package" },
                Dimensions: {
                  UnitOfMeasurement: { Code: "CM" },
                  Length: String(params.length || 30),
                  Width: String(params.breadth || 25),
                  Height: String(params.height || 10),
                },
                PackageWeight: {
                  UnitOfMeasurement: { Code: "KGS" },
                  Weight: String(totalWeight),
                },
                Description: productsDesc.slice(0, 50),
              },
            ],
          },
          LabelSpecification: {
            LabelImageFormat: { Code: "PDF" },
            LabelStockSize: { Height: "6", Width: "4" },
          },
        },
      };

      const shipData = await upsFetch(token, "POST", "/api/shipments/v2409/ship", shipPayload);

      const shipResult = shipData?.ShipmentResponse?.ShipmentResults;
      const trackingNumber =
        shipResult?.ShipmentIdentificationNumber ||
        shipResult?.PackageResults?.[0]?.TrackingNumber;
      const labelUrl =
        shipResult?.PackageResults?.[0]?.ShippingLabel?.GraphicImage || undefined;

      if (!trackingNumber) {
        const errMsg =
          shipData?.response?.errors?.[0]?.message ||
          shipData?.Fault?.detail?.Errors?.ErrorDetail?.PrimaryErrorCode?.Description ||
          JSON.stringify(shipData).slice(0, 300);
        return {
          success: false,
          error: errMsg || "UPS did not return a tracking number",
          rawResponse: shipData,
        };
      }

      // Schedule pickup
      const pickupDate = new Date();
      pickupDate.setDate(pickupDate.getDate() + 1);
      const pickupDateStr = pickupDate.toISOString().split("T")[0].replace(/-/g, "");

      const pickupPayload = {
        PickupCreationRequest: {
          RatePickupIndicator: "N",
          PickupDateInfo: {
            CloseTime: "1700",
            ReadyTime: "0900",
            PickupDate: pickupDateStr,
          },
          PickupAddress: {
            CompanyName: params.senderName.slice(0, 35) || "Customer",
            ContactName: params.senderName.slice(0, 35) || "Customer",
            AddressLine: params.senderAddress.slice(0, 100),
            City: params.senderCity.slice(0, 30),
            StateProvince: params.senderState.slice(0, 5).toUpperCase(),
            PostalCode: params.senderPincode,
            CountryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
            Phone: {
              Number: params.senderPhone.replace(/[^0-9]/g, "").slice(0, 15) || "0000000000",
            },
          },
          TotalWeight: {
            Weight: String(totalWeight),
            UnitOfMeasurement: "KGS",
          },
          OverweightIndicator: "N",
          PaymentMethod: "01",
          ShippingLabelsAvailable: "Y",
          NumberOfPieces: "1",
        },
      };

      const pickupData = await upsFetch(
        token,
        "POST",
        "/api/pickupcreation/v1/pickup",
        pickupPayload,
      );
      const estimatedPickup = pickupData?.PickupCreationResponse?.PRN || undefined;

      return {
        success: true,
        awb: trackingNumber,
        trackingUrl: `https://www.ups.com/track?tracknum=${trackingNumber}`,
        labelUrl: labelUrl || undefined,
        estimatedPickup,
        rawResponse: { shipment: shipData, pickup: pickupData },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create UPS pickup",
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

      const data = await upsFetch(
        token,
        "GET",
        `/api/track/v1/details/${encodeURIComponent(awb)}`,
      );

      const trackResponse = data?.trackResponse?.shipment?.[0];
      const pkg = trackResponse?.package?.[0];

      if (!pkg) {
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

      const activities: any[] = pkg.activity || [];
      const events: TrackingEvent[] = activities.map((activity: any) => {
        const loc = activity.location?.address || {};
        const locationStr = [loc.city, loc.stateProvince, loc.countryCode]
          .filter(Boolean)
          .join(", ");

        return {
          timestamp: activity.date && activity.time
            ? `${activity.date.slice(0, 4)}-${activity.date.slice(4, 6)}-${activity.date.slice(6, 8)}T${activity.time.slice(0, 2)}:${activity.time.slice(2, 4)}:${activity.time.slice(4, 6)}`
            : activity.date || "",
          status: activity.status?.description || "",
          statusCode: activity.status?.code || activity.status?.type || "",
          location: locationStr,
          description: activity.status?.description || "",
        };
      });

      const currentActivity = activities[0];
      const currentStatus = currentActivity?.status?.description || "In Transit";
      const currentStatusCode = currentActivity?.status?.code || "";
      const isDelivered =
        currentStatusCode === "D" ||
        currentStatus.toLowerCase().includes("delivered");

      const deliveryDate = pkg.deliveryDate?.[0]?.date;
      const estimatedDelivery = deliveryDate
        ? `${deliveryDate.slice(0, 4)}-${deliveryDate.slice(4, 6)}-${deliveryDate.slice(6, 8)}`
        : undefined;

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
    const { client_id, client_secret } = credentials;

    try {
      const token = await getOAuthToken(client_id, client_secret);

      // Use the shipping endpoint with validation to check serviceability
      const payload = {
        ShipmentRequest: {
          Request: {
            RequestOption: "validate",
          },
          Shipment: {
            Shipper: {
              Address: {
                PostalCode: originPin,
                CountryCode: "US",
              },
            },
            ShipTo: {
              Address: {
                PostalCode: destPin,
                CountryCode: "US",
              },
            },
            ShipFrom: {
              Address: {
                PostalCode: originPin,
                CountryCode: "US",
              },
            },
            Service: { Code: "03", Description: "UPS Ground" },
            Package: [
              {
                PackagingType: { Code: "02" },
                PackageWeight: {
                  UnitOfMeasurement: { Code: "KGS" },
                  Weight: "1",
                },
              },
            ],
            PaymentInformation: {
              ShipmentCharge: [
                {
                  Type: "01",
                  BillShipper: { AccountNumber: credentials.account_number },
                },
              ],
            },
          },
        },
      };

      const data = await upsFetch(token, "POST", "/api/shipments/v2409/ship", payload);

      if (data?.ShipmentResponse?.ShipmentResults) {
        const transitDays = data.ShipmentResponse.ShipmentResults.BillingWeight?.Weight
          ? undefined
          : undefined;

        return {
          serviceable: true,
          estimatedDays: transitDays,
          codAvailable: false, // UPS COD requires separate configuration
        };
      }

      if (data?.response?.errors?.length > 0) {
        return {
          serviceable: false,
          error: data.response.errors[0].message || "Route not serviceable",
        };
      }

      return {
        serviceable: false,
        error: "Unable to determine serviceability for this route",
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
        error: err.message || "Failed to validate UPS credentials",
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

      // UPS uses DELETE with the PRN (Pickup Request Number) in the URL
      const data = await upsFetch(
        token,
        "DELETE",
        `/api/pickupcancel/v1/pickup/${encodeURIComponent(awb)}`,
      );

      if (
        data?.PickupCancelResponse?.Response?.ResponseStatus?.Code === "1" ||
        data?.PickupCancelResponse
      ) {
        return { success: true };
      }

      if (data?.response?.errors?.length > 0) {
        return {
          success: false,
          error: data.response.errors[0].message || "Failed to cancel UPS pickup",
        };
      }

      // Check raw response
      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (lower.includes("success") || lower.includes("cancel")) {
          return { success: true };
        }
      }

      return {
        success: false,
        error: "Cancellation response unclear",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel UPS pickup",
      };
    }
  }
}
