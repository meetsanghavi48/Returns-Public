import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  TrackingEvent,
  ServiceabilityResult,
} from "./base";

interface ShipStationLabelRequest {
  carrierCode: string;
  serviceCode: string;
  packageCode: string;
  shipFrom: ShipStationAddress;
  shipTo: ShipStationAddress;
  weight: { value: number; units: string };
  dimensions: { length: number; width: number; height: number; units: string };
  testLabel: boolean;
}

interface ShipStationAddress {
  name: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

interface ShipStationLabelResponse {
  shipmentId: number;
  trackingNumber: string;
  labelData: string;
  formData: string | null;
  shipmentCost: number;
  insuranceCost: number;
}

interface ShipStationShipment {
  shipmentId: number;
  trackingNumber: string;
  shipDate: string;
  voidDate: string | null;
  carrierCode: string;
  serviceCode: string;
  shipmentCost: number;
  voided: boolean;
}

interface ShipStationShipmentsResponse {
  shipments: ShipStationShipment[];
  total: number;
  page: number;
  pages: number;
}

interface ShipStationCarrier {
  name: string;
  code: string;
  accountNumber: string;
  primary: boolean;
}

export class ShipStationAdapter extends LogisticsAdapter {
  readonly key = "shipstation";
  readonly displayName = "ShipStation";
  readonly region = "global";
  readonly logoUrl = "/logos/shipstation.png";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Enter your ShipStation API key",
      helpText: "Found in ShipStation under Settings > API Settings",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Enter your ShipStation API secret",
    },
  ];

  private readonly baseUrl = "https://ssapi.shipstation.com";

  private buildHeaders(credentials: Record<string, string>): Record<string, string> {
    const encoded = btoa(`${credentials.apiKey}:${credentials.apiSecret}`);
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };
  }

  private buildAddress(
    name: string,
    phone: string,
    address: string,
    city: string,
    state: string,
    pincode: string,
    country: string,
  ): ShipStationAddress {
    return {
      name,
      street1: address,
      city,
      state,
      postalCode: pincode,
      country,
      phone,
    };
  }

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const headers = this.buildHeaders(credentials);

    // First, get available carriers to use the primary one
    const carriersRes = await fetch(`${this.baseUrl}/carriers`, {
      method: "GET",
      headers,
    });

    if (!carriersRes.ok) {
      const errorBody = await carriersRes.text();
      return { success: false, error: `ShipStation carriers fetch failed: ${errorBody}` };
    }

    const carriers: ShipStationCarrier[] = await carriersRes.json();
    const primaryCarrier = carriers.find((c) => c.primary) ?? carriers[0];

    if (!primaryCarrier) {
      return { success: false, error: "No carriers configured in ShipStation account" };
    }

    const shipFrom = this.buildAddress(
      params.senderName,
      params.senderPhone,
      params.senderAddress,
      params.senderCity,
      params.senderState,
      params.senderPincode,
      params.senderCountry,
    );

    const shipTo = this.buildAddress(
      params.receiverName,
      params.receiverPhone,
      params.receiverAddress,
      params.receiverCity,
      params.receiverState,
      params.receiverPincode,
      params.receiverCountry,
    );

    // Convert weight from grams to ounces
    const weightOz = params.weight / 28.3495;

    const labelRequest: ShipStationLabelRequest = {
      carrierCode: primaryCarrier.code,
      serviceCode: `${primaryCarrier.code}_domestic`, // default service
      packageCode: "package",
      shipFrom,
      shipTo,
      weight: { value: weightOz, units: "ounces" },
      dimensions: {
        length: params.length ?? 10,
        width: params.breadth ?? 10,
        height: params.height ?? 10,
        units: "centimeters",
      },
      testLabel: false,
    };

    const labelRes = await fetch(`${this.baseUrl}/shipments/createlabel`, {
      method: "POST",
      headers,
      body: JSON.stringify(labelRequest),
    });

    if (!labelRes.ok) {
      const errorBody = await labelRes.text();
      return { success: false, error: `ShipStation label creation failed: ${errorBody}` };
    }

    const label: ShipStationLabelResponse = await labelRes.json();

    return {
      success: true,
      awb: label.trackingNumber,
      // ShipStation returns label as base64 PDF data rather than a URL
      labelUrl: label.labelData ? `data:application/pdf;base64,${label.labelData}` : undefined,
      rawResponse: label,
    };
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const headers = this.buildHeaders(credentials);

    // ShipStation doesn't have a dedicated tracking endpoint.
    // Look up shipments by tracking number to get basic status.
    const res = await fetch(
      `${this.baseUrl}/shipments?trackingNumber=${encodeURIComponent(awb)}`,
      { method: "GET", headers },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return {
        success: false,
        awb,
        currentStatus: "unknown",
        currentStatusCode: "UNKNOWN",
        events: [],
        isDelivered: false,
        error: `ShipStation tracking lookup failed: ${errorBody}`,
      };
    }

    const data: ShipStationShipmentsResponse = await res.json();

    if (data.shipments.length === 0) {
      return {
        success: false,
        awb,
        currentStatus: "unknown",
        currentStatusCode: "UNKNOWN",
        events: [],
        isDelivered: false,
        error: "No shipment found with this tracking number",
      };
    }

    const shipment = data.shipments[0];
    const isVoided = shipment.voided;
    const status = isVoided ? "voided" : "shipped";

    const events: TrackingEvent[] = [
      {
        timestamp: shipment.shipDate,
        status: "shipped",
        statusCode: "SHIPPED",
        location: "",
        description: `Shipped via ${shipment.carrierCode} (${shipment.serviceCode})`,
      },
    ];

    if (shipment.voidDate) {
      events.push({
        timestamp: shipment.voidDate,
        status: "voided",
        statusCode: "VOIDED",
        location: "",
        description: "Shipment label voided",
      });
    }

    return {
      success: true,
      awb,
      currentStatus: status,
      currentStatusCode: status.toUpperCase(),
      events,
      isDelivered: false,
      rawResponse: data,
    };
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    // ShipStation doesn't offer a dedicated serviceability endpoint.
    return { serviceable: true };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const headers = this.buildHeaders(credentials);

    const res = await fetch(`${this.baseUrl}/carriers`, {
      method: "GET",
      headers,
    });

    if (res.ok) {
      return { valid: true };
    }

    if (res.status === 401) {
      return { valid: false, error: "Invalid ShipStation API key or secret" };
    }

    return { valid: false, error: `ShipStation credential validation failed (HTTP ${res.status})` };
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const headers = this.buildHeaders(credentials);

    // ShipStation voids shipments via POST /shipments/voidlabel
    const res = await fetch(`${this.baseUrl}/shipments/voidlabel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ shipmentId: awb }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return { success: false, error: `ShipStation void failed: ${errorBody}` };
    }

    const result: { approved: boolean; message: string } = await res.json();

    return {
      success: result.approved,
      error: result.approved ? undefined : result.message,
    };
  }
}
