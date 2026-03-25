import {
  LogisticsAdapter,
  type CredentialField,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
} from "./base";

const API_BASE_PROD = "https://soa-gw.canadapost.ca";
const API_BASE_SANDBOX = "https://ct.soa-gw.canadapost.ca";

function getBaseUrl(credentials: Record<string, string>): string {
  return credentials.useSandbox === "true" ? API_BASE_SANDBOX : API_BASE_PROD;
}

async function canadaPostFetch(
  apiKey: string,
  method: string,
  baseUrl: string,
  urlPath: string,
  accept: string,
  body?: string,
  contentType?: string,
): Promise<any> {
  const url = baseUrl + urlPath;
  const basicAuth = btoa(`${apiKey}:${apiKey}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    Accept: accept,
  };
  const opts: RequestInit = { method, headers };

  if (body) {
    headers["Content-Type"] = contentType || "application/vnd.cpc.shipment-v8+xml";
    opts.body = body;
  }

  const response = await fetch(url, opts);
  const text = await response.text();

  // Try to parse as JSON first (for tracking endpoint)
  try {
    return JSON.parse(text);
  } catch {
    // Return as XML text with status
    return { raw: text, status: response.status };
  }
}

function parseXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function parseXmlValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function parseXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

export class CanadaPostAdapter extends LogisticsAdapter {
  readonly key = "canada_post";
  readonly displayName = "Canada Post";
  readonly region = "CA";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=canadapost.ca&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key Username",
      type: "password",
      required: true,
      placeholder: "Enter your API key username",
    },
    {
      key: "apiKeyPassword",
      label: "API Key Password",
      type: "password",
      required: true,
      placeholder: "Enter your API key password",
    },
    {
      key: "customerNumber",
      label: "Customer Number",
      type: "text",
      required: true,
      placeholder: "Enter your customer number",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { apiKey, customerNumber, contractId } = credentials;
    const baseUrl = getBaseUrl(credentials);

    const totalWeight = Math.max(params.weight / 1000, 0.5);
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 44) || "Return";

    const shipmentXml = `<?xml version="1.0" encoding="UTF-8"?>
<shipment xmlns="http://www.canadapost.ca/ws/shipment-v8">
  <group-id>${params.orderNumber.slice(0, 32)}</group-id>
  <requested-shipping-point>${(params.senderPincode || "K1A0B1").replace(/\s/g, "")}</requested-shipping-point>
  <delivery-spec>
    <service-code>DOM.EP</service-code>
    <sender>
      <name>${(params.senderName || "Customer").slice(0, 44)}</name>
      <company>${(params.senderName || "Customer").slice(0, 44)}</company>
      <contact-phone>${params.senderPhone.replace(/[^0-9]/g, "").slice(-10) || "5555555555"}</contact-phone>
      <address-details>
        <address-line-1>${(params.senderAddress || "N/A").slice(0, 44)}</address-line-1>
        <city>${(params.senderCity || "Ottawa").slice(0, 40)}</city>
        <prov-state>${(params.senderState || "ON").slice(0, 2)}</prov-state>
        <postal-zip-code>${(params.senderPincode || "K1A0B1").replace(/\s/g, "")}</postal-zip-code>
        <country-code>${(params.senderCountry || "CA").slice(0, 2)}</country-code>
      </address-details>
    </sender>
    <destination>
      <name>${(params.receiverName || "Warehouse").slice(0, 44)}</name>
      <company>${(params.receiverName || "Warehouse").slice(0, 44)}</company>
      <address-details>
        <address-line-1>${(params.receiverAddress || "N/A").slice(0, 44)}</address-line-1>
        <city>${(params.receiverCity || "Toronto").slice(0, 40)}</city>
        <prov-state>${(params.receiverState || "ON").slice(0, 2)}</prov-state>
        <postal-zip-code>${(params.receiverPincode || "M5V2T6").replace(/\s/g, "")}</postal-zip-code>
        <country-code>${(params.receiverCountry || "CA").slice(0, 2)}</country-code>
      </address-details>
    </destination>
    <parcel-characteristics>
      <weight>${totalWeight.toFixed(3)}</weight>
      <dimensions>
        <length>${params.length || 30}</length>
        <width>${params.breadth || 25}</width>
        <height>${params.height || 10}</height>
      </dimensions>
    </parcel-characteristics>
    <preferences>
      <show-packing-instructions>true</show-packing-instructions>
    </preferences>
    <references>
      <customer-ref-1>${params.orderNumber.slice(0, 35)}</customer-ref-1>
      <customer-ref-2>${params.returnId.slice(0, 35)}</customer-ref-2>
    </references>
  </delivery-spec>
</shipment>`;

    try {
      const data = await canadaPostFetch(
        apiKey,
        "POST",
        baseUrl,
        `/rs/${encodeURIComponent(customerNumber)}/${encodeURIComponent(contractId)}/shipment`,
        "application/vnd.cpc.shipment-v8+xml",
        shipmentXml,
        "application/vnd.cpc.shipment-v8+xml",
      );

      const rawXml = data?.raw || "";
      const trackingPin = parseXmlValue(rawXml, "tracking-pin");
      const labelLink = rawXml.match(/rel="label"\s+href="([^"]+)"/)?.[1] ||
        rawXml.match(/href="([^"]+)"[^>]*rel="label"/)?.[1];

      if (trackingPin) {
        return {
          success: true,
          awb: trackingPin,
          trackingUrl: `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${trackingPin}`,
          labelUrl: labelLink || undefined,
          rawResponse: data,
        };
      }

      const errorMsg =
        parseXmlValue(rawXml, "description") ||
        parseXmlValue(rawXml, "message") ||
        (typeof rawXml === "string" ? rawXml.slice(0, 300) : JSON.stringify(data).slice(0, 300));

      return {
        success: false,
        error: errorMsg || "Canada Post did not return a tracking pin",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Canada Post shipment",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { apiKey } = credentials;
    const baseUrl = getBaseUrl(credentials);

    try {
      const data = await canadaPostFetch(
        apiKey,
        "GET",
        baseUrl,
        `/vis/track/pin/${encodeURIComponent(awb)}/summary`,
        "application/vnd.cpc.track-v2+xml",
      );

      const rawXml = data?.raw || "";

      if (data?.status === 404 || rawXml.includes("<messages>")) {
        const errorDesc = parseXmlValue(rawXml, "description") || "Tracking information not found";
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error: errorDesc,
          rawResponse: data,
        };
      }

      const eventBlocks = parseXmlBlocks(rawXml, "significant-event");
      const events: TrackingEvent[] = eventBlocks.map((block) => ({
        timestamp: parseXmlValue(block, "event-date") || "",
        status: parseXmlValue(block, "event-description") || "",
        statusCode: parseXmlValue(block, "event-type") || "",
        location: parseXmlValue(block, "event-site") || "",
        description: parseXmlValue(block, "event-description") || "",
      }));

      const pinSummary = rawXml;
      const currentStatus =
        parseXmlValue(pinSummary, "event-description") || events[0]?.status || "In Transit";
      const currentStatusCode =
        parseXmlValue(pinSummary, "event-type") || events[0]?.statusCode || "";
      const expectedDelivery = parseXmlValue(pinSummary, "expected-delivery-date");
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "0032";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: expectedDelivery || undefined,
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
    const { apiKey, customerNumber } = credentials;
    const baseUrl = getBaseUrl(credentials);

    const fromPostal = originPin.replace(/\s/g, "");
    const toPostal = destPin.replace(/\s/g, "");

    try {
      const data = await canadaPostFetch(
        apiKey,
        "GET",
        baseUrl,
        `/rs/${encodeURIComponent(customerNumber)}/service?origPostalCode=${encodeURIComponent(fromPostal)}&destPostalCode=${encodeURIComponent(toPostal)}`,
        "application/vnd.cpc.ship.rate-v4+xml",
      );

      const rawXml = data?.raw || "";
      const serviceCodes = parseXmlValues(rawXml, "service-code");

      if (!serviceCodes.length) {
        return {
          serviceable: false,
          error: `No services available between ${originPin} and ${destPin}`,
        };
      }

      const deliveryDate = parseXmlValue(rawXml, "expected-delivery-date");
      let estimatedDays: number | undefined;
      if (deliveryDate) {
        const diff = new Date(deliveryDate).getTime() - Date.now();
        estimatedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }

      return {
        serviceable: true,
        estimatedDays,
        codAvailable: false, // Canada Post does not offer COD for standard services
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
    const { apiKey, customerNumber } = credentials;

    if (!apiKey) {
      return { valid: false, error: "API key is required" };
    }
    if (!customerNumber) {
      return { valid: false, error: "Customer number is required" };
    }

    try {
      const baseUrl = getBaseUrl(credentials);
      const data = await canadaPostFetch(
        apiKey,
        "GET",
        baseUrl,
        `/rs/${encodeURIComponent(customerNumber)}/service?origPostalCode=K1A0B1&destPostalCode=M5V2T6`,
        "application/vnd.cpc.ship.rate-v4+xml",
      );

      const rawXml = data?.raw || "";

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }

      if (rawXml.toLowerCase().includes("unauthorized") || rawXml.toLowerCase().includes("forbidden")) {
        return { valid: false, error: "Invalid API key or customer number" };
      }

      // If we get services back or a valid XML response, credentials are good
      if (rawXml.includes("service-code") || rawXml.includes("services")) {
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
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { apiKey, customerNumber } = credentials;
    const baseUrl = getBaseUrl(credentials);

    try {
      // Canada Post allows voiding a shipment before it is transmitted/manifested
      const data = await canadaPostFetch(
        apiKey,
        "DELETE",
        baseUrl,
        `/rs/${encodeURIComponent(customerNumber)}/shipment/${encodeURIComponent(awb)}`,
        "application/vnd.cpc.shipment-v8+xml",
      );

      const rawXml = data?.raw || "";

      // A successful DELETE returns 204 or empty body
      if (data?.status === 204 || data?.status === 200 || rawXml === "") {
        return { success: true };
      }

      if (rawXml.toLowerCase().includes("voided") || rawXml.toLowerCase().includes("cancelled")) {
        return { success: true };
      }

      const errorMsg =
        parseXmlValue(rawXml, "description") ||
        parseXmlValue(rawXml, "message") ||
        (typeof rawXml === "string" ? rawXml.slice(0, 200) : "Cancellation response unclear");

      return { success: false, error: errorMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel shipment",
      };
    }
  }
}
