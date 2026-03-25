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

const EXPRESS_BASE = "https://api-eu.dhl.com";
const TRACKING_BASE = "https://api-eu.dhl.com/track";

async function dhlFetch(
  apiKey: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<any> {
  const headers: Record<string, string> = {
    "DHL-API-Key": apiKey,
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

export class DHLAdapter extends LogisticsAdapter {
  readonly key = "dhl";
  readonly displayName = "DHL National Returns";
  readonly region = "global";
  readonly logoUrl = "/logos/dhl.png";
  readonly meta: AdapterMeta = {
    setupGuideUrl: "https://developer.dhl.com/documentation",
  };

  readonly credentialFields: CredentialField[] = [
    {
      key: "app_id",
      label: "Developer Portal App ID",
      type: "text",
      required: true,
      placeholder: "Enter your app id",
    },
    {
      key: "app_token",
      label: "Developer Portal App Token",
      type: "text",
      required: true,
      placeholder: "Enter your app token",
    },
    {
      key: "user_id",
      label: "Business Portal User ID",
      type: "text",
      required: true,
      placeholder: "Enter your user id",
    },
    {
      key: "user_password",
      label: "Business Portal User Password",
      type: "password",
      required: true,
      placeholder: "Enter your user password",
    },
    {
      key: "countries",
      label: "Select countries where you operate",
      type: "multiselect",
      required: true,
      options: [
        { label: "United Kingdom", value: "United Kingdom" },
        { label: "Germany", value: "Germany" },
        { label: "France", value: "France" },
        { label: "Netherlands", value: "Netherlands" },
        { label: "Belgium", value: "Belgium" },
        { label: "Austria", value: "Austria" },
        { label: "Italy", value: "Italy" },
        { label: "Spain", value: "Spain" },
        { label: "Poland", value: "Poland" },
        { label: "Czech Republic", value: "Czech Republic" },
        { label: "Slovakia", value: "Slovakia" },
        { label: "Hungary", value: "Hungary" },
        { label: "Romania", value: "Romania" },
        { label: "Portugal", value: "Portugal" },
        { label: "Sweden", value: "Sweden" },
        { label: "Denmark", value: "Denmark" },
        { label: "Finland", value: "Finland" },
        { label: "Norway", value: "Norway" },
      ],
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { app_token: api_key, user_id: account_number } = credentials;

    try {
      const totalWeight = Math.max(params.weight / 1000, 0.5); // kg
      const productsDesc =
        params.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", ")
          .slice(0, 200) || "Return Shipment";
      const totalAmount = params.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );

      // Create shipment to get AWB
      const shipmentPayload = {
        plannedShippingDateAndTime: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        pickup: { isRequested: true },
        productCode: "P",
        accounts: [
          { typeCode: "shipper", number: account_number },
        ],
        customerDetails: {
          shipperDetails: {
            postalAddress: {
              postalCode: params.senderPincode,
              cityName: params.senderCity,
              countryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
              addressLine1: params.senderAddress.slice(0, 100),
            },
            contactInformation: {
              phone: params.senderPhone.replace(/[^0-9+]/g, "").slice(0, 15) || "0000000000",
              companyName: params.senderName.slice(0, 50) || "Customer",
              fullName: params.senderName.slice(0, 50) || "Customer",
            },
          },
          receiverDetails: {
            postalAddress: {
              postalCode: params.receiverPincode,
              cityName: params.receiverCity,
              countryCode: params.receiverCountry.slice(0, 2).toUpperCase() || "US",
              addressLine1: params.receiverAddress.slice(0, 100),
            },
            contactInformation: {
              phone:
                params.receiverPhone.replace(/[^0-9+]/g, "").slice(0, 15) || "0000000000",
              companyName: params.receiverName.slice(0, 50) || "Warehouse",
              fullName: params.receiverName.slice(0, 50) || "Warehouse",
            },
          },
        },
        content: {
          packages: [
            {
              weight: totalWeight,
              dimensions: {
                length: params.length || 30,
                width: params.breadth || 25,
                height: params.height || 10,
              },
              customerReferences: [
                { value: params.orderNumber, typeCode: "CU" },
              ],
              description: productsDesc,
            },
          ],
          isCustomsDeclarable: false,
          declaredValue: totalAmount,
          declaredValueCurrency: "USD",
          unitOfMeasurement: "metric",
          description: productsDesc,
        },
        outputImageProperties: {
          imageOptions: [
            {
              typeCode: "label",
              templateName: "ECOM26_84_001",
            },
          ],
        },
      };

      const shipData = await dhlFetch(
        api_key,
        "POST",
        `${EXPRESS_BASE}/express/shipments`,
        shipmentPayload,
      );

      const awb =
        shipData?.shipmentTrackingNumber ||
        shipData?.packages?.[0]?.trackingNumber;
      const labelUrl =
        shipData?.documents?.[0]?.url || undefined;
      const dispatchConfirmation =
        shipData?.dispatchConfirmationNumber || undefined;

      if (!awb) {
        const errMsg =
          shipData?.detail ||
          shipData?.message ||
          shipData?.additionalDetails?.[0] ||
          JSON.stringify(shipData).slice(0, 300);
        return {
          success: false,
          error: errMsg || "DHL did not return a tracking number",
          rawResponse: shipData,
        };
      }

      // If pickup was not embedded, schedule it separately
      let estimatedPickup = dispatchConfirmation;
      if (!estimatedPickup) {
        try {
          const pickupPayload = {
            plannedPickupDateAndTime: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            closeTime: "17:00",
            location: "Front Door",
            accounts: [
              { typeCode: "shipper", number: account_number },
            ],
            customerDetails: {
              shipperDetails: {
                postalAddress: {
                  postalCode: params.senderPincode,
                  cityName: params.senderCity,
                  countryCode: params.senderCountry.slice(0, 2).toUpperCase() || "US",
                  addressLine1: params.senderAddress.slice(0, 100),
                },
                contactInformation: {
                  phone:
                    params.senderPhone.replace(/[^0-9+]/g, "").slice(0, 15) || "0000000000",
                  companyName: params.senderName.slice(0, 50) || "Customer",
                  fullName: params.senderName.slice(0, 50) || "Customer",
                },
              },
            },
            shipmentDetails: [
              {
                productCode: "P",
                packages: [{ weight: totalWeight, dimensions: { length: params.length || 30, width: params.breadth || 25, height: params.height || 10 } }],
                accounts: [{ typeCode: "shipper", number: account_number }],
              },
            ],
          };

          const pickupData = await dhlFetch(
            api_key,
            "POST",
            `${EXPRESS_BASE}/express/pickups`,
            pickupPayload,
          );
          estimatedPickup =
            pickupData?.dispatchConfirmationNumber || undefined;
        } catch {
          // Pickup scheduling failed but shipment was created
        }
      }

      return {
        success: true,
        awb,
        trackingUrl: `https://www.dhl.com/en/express/tracking.html?AWB=${awb}`,
        labelUrl: labelUrl || undefined,
        estimatedPickup,
        rawResponse: shipData,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create DHL pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { app_token: api_key } = credentials;

    try {
      const data = await dhlFetch(
        api_key,
        "GET",
        `${TRACKING_BASE}/shipments?trackingNumber=${encodeURIComponent(awb)}`,
      );

      const shipments = data?.shipments;
      const shipment = shipments?.[0];

      if (!shipment) {
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

      const dhlEvents: any[] = shipment.events || [];
      const events: TrackingEvent[] = dhlEvents.map((event: any) => ({
        timestamp: event.timestamp || event.date || "",
        status: event.description || event.status || "",
        statusCode: event.statusCode || event.typeCode || "",
        location: event.location?.address?.addressLocality
          ? `${event.location.address.addressLocality}, ${event.location.address.countryCode || ""}`
          : "",
        description: event.description || "",
      }));

      const status = shipment.status || {};
      const currentStatus =
        status.description || status.status || "In Transit";
      const currentStatusCode = status.statusCode || "";
      const isDelivered =
        currentStatusCode === "delivered" ||
        currentStatus.toLowerCase().includes("delivered");

      const estimatedDelivery =
        shipment.estimatedTimeOfDelivery || undefined;

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
    const { app_token: api_key, user_id: account_number } = credentials;

    try {
      const payload = {
        customerDetails: {
          shipperDetails: {
            postalCode: originPin,
            cityName: "",
            countryCode: "US",
            addressLine1: "",
          },
          receiverDetails: {
            postalCode: destPin,
            cityName: "",
            countryCode: "US",
            addressLine1: "",
          },
        },
        accounts: [
          { typeCode: "shipper", number: account_number },
        ],
        plannedShippingDateAndTime: new Date().toISOString(),
        unitOfMeasurement: "metric",
        isCustomsDeclarable: false,
        packages: [
          {
            weight: 1,
            dimensions: { length: 30, width: 25, height: 10 },
          },
        ],
      };

      const data = await dhlFetch(
        api_key,
        "POST",
        `${EXPRESS_BASE}/express/rates`,
        payload,
      );

      const products = data?.products || [];

      if (products.length > 0) {
        const firstProduct = products[0];
        const transitDays = firstProduct?.deliveryCapabilities?.totalTransitDays
          ? parseInt(firstProduct.deliveryCapabilities.totalTransitDays, 10)
          : undefined;

        return {
          serviceable: true,
          estimatedDays: transitDays || undefined,
          codAvailable: false, // DHL Express COD is region-specific
        };
      }

      if (data?.detail || data?.message) {
        return {
          serviceable: false,
          error: data.detail || data.message || "Route not serviceable",
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
    const { app_token: api_key } = credentials;

    if (!api_key) {
      return { valid: false, error: "API key is required" };
    }

    try {
      // Validate by making a lightweight tracking request with a test number
      const data = await dhlFetch(
        api_key,
        "GET",
        `${TRACKING_BASE}/shipments?trackingNumber=1234567890`,
      );

      // If we get an auth error, the key is invalid
      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid DHL API key" };
      }

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid")
        ) {
          return { valid: false, error: "Invalid DHL API key" };
        }
      }

      if (data?.detail?.toLowerCase()?.includes("unauthorized")) {
        return { valid: false, error: "Invalid DHL API key" };
      }

      // Any other response (even "not found") means the key is valid
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate DHL credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { app_token: api_key } = credentials;

    try {
      // DHL uses DELETE with the dispatch confirmation number
      const data = await dhlFetch(
        api_key,
        "DELETE",
        `${EXPRESS_BASE}/express/pickups/${encodeURIComponent(awb)}`,
      );

      // Successful cancellation typically returns 200 with no body or a confirmation
      if (
        data?.raw === "" ||
        data?.status === 200 ||
        data?.status === 204
      ) {
        return { success: true };
      }

      // Check for explicit success indicators
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

      // If there are no errors in the response, treat as success
      if (!data?.detail && !data?.message && !data?.errors) {
        return { success: true };
      }

      const errMsg =
        data?.detail ||
        data?.message ||
        data?.errors?.[0]?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel DHL pickup",
      };
    }
  }
}
