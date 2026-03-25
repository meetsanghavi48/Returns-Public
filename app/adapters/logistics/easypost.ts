import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  TrackingEvent,
  ServiceabilityResult,
} from "./base";

interface EasyPostAddress {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
}

interface EasyPostParcel {
  length: number;
  width: number;
  height: number;
  weight: number;
}

interface EasyPostRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
}

interface EasyPostShipmentResponse {
  id: string;
  tracking_code: string | null;
  rates: EasyPostRate[];
  selected_rate: EasyPostRate | null;
  postage_label: { label_url: string } | null;
  tracker: { id: string; public_url: string } | null;
  messages: Array<{ message: string }>;
}

interface EasyPostBuyResponse {
  id: string;
  tracking_code: string;
  postage_label: { label_url: string };
  tracker: { id: string; public_url: string };
  selected_rate: EasyPostRate;
}

interface EasyPostTrackerResponse {
  id: string;
  tracking_code: string;
  status: string;
  est_delivery_date: string | null;
  tracking_details: Array<{
    datetime: string;
    message: string;
    status: string;
    tracking_location: {
      city: string;
      state: string;
      country: string;
    };
  }>;
  public_url: string;
}

export class EasyPostAdapter extends LogisticsAdapter {
  readonly key = "easypost";
  readonly displayName = "EasyPost";
  readonly region = "global";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=easypost.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your EasyPost API key",
      helpText: "Use your test key (starts with 'EZTEST') for testing, production key for live shipments",
    },
  ];

  private readonly baseUrl = "https://api.easypost.com/v2";

  private buildHeaders(credentials: Record<string, string>): Record<string, string> {
    const encoded = btoa(`${credentials.apiKey}:`);
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
  ): EasyPostAddress {
    return {
      name,
      street1: address,
      city,
      state,
      zip: pincode,
      country,
      phone,
    };
  }

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const headers = this.buildHeaders(credentials);

    const fromAddress = this.buildAddress(
      params.senderName,
      params.senderPhone,
      params.senderAddress,
      params.senderCity,
      params.senderState,
      params.senderPincode,
      params.senderCountry,
    );

    const toAddress = this.buildAddress(
      params.receiverName,
      params.receiverPhone,
      params.receiverAddress,
      params.receiverCity,
      params.receiverState,
      params.receiverPincode,
      params.receiverCountry,
    );

    // EasyPost expects weight in oz; convert from grams
    const weightOz = params.weight / 28.3495;

    const parcel: EasyPostParcel = {
      length: params.length ?? 10,
      width: params.breadth ?? 10,
      height: params.height ?? 10,
      weight: weightOz,
    };

    // Step 1: Create shipment
    const shipmentRes = await fetch(`${this.baseUrl}/shipments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        shipment: {
          from_address: fromAddress,
          to_address: toAddress,
          parcel,
        },
      }),
    });

    if (!shipmentRes.ok) {
      const errorBody = await shipmentRes.text();
      return { success: false, error: `EasyPost shipment creation failed: ${errorBody}` };
    }

    const shipment: EasyPostShipmentResponse = await shipmentRes.json();

    if (!shipment.rates || shipment.rates.length === 0) {
      return {
        success: false,
        error: "No rates returned by EasyPost",
        rawResponse: shipment,
      };
    }

    // Pick the lowest rate
    const lowestRate = shipment.rates.reduce((min, r) =>
      parseFloat(r.rate) < parseFloat(min.rate) ? r : min,
    );

    // Step 2: Buy the shipment (purchase label)
    const buyRes = await fetch(`${this.baseUrl}/shipments/${shipment.id}/buy`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        rate: { id: lowestRate.id },
      }),
    });

    if (!buyRes.ok) {
      const errorBody = await buyRes.text();
      return { success: false, error: `EasyPost label purchase failed: ${errorBody}` };
    }

    const purchased: EasyPostBuyResponse = await buyRes.json();

    return {
      success: true,
      awb: purchased.tracking_code,
      trackingUrl: purchased.tracker?.public_url,
      labelUrl: purchased.postage_label?.label_url,
      rawResponse: purchased,
    };
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const headers = this.buildHeaders(credentials);

    // Create a tracker by tracking code (EasyPost will auto-detect carrier)
    const createRes = await fetch(`${this.baseUrl}/trackers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tracker: { tracking_code: awb },
      }),
    });

    if (!createRes.ok) {
      const errorBody = await createRes.text();
      return {
        success: false,
        awb,
        currentStatus: "unknown",
        currentStatusCode: "UNKNOWN",
        events: [],
        isDelivered: false,
        error: `EasyPost tracking failed: ${errorBody}`,
      };
    }

    const tracker: EasyPostTrackerResponse = await createRes.json();

    const events: TrackingEvent[] = tracker.tracking_details.map((d) => ({
      timestamp: d.datetime,
      status: d.status,
      statusCode: d.status.toUpperCase().replace(/\s+/g, "_"),
      location: [d.tracking_location.city, d.tracking_location.state, d.tracking_location.country]
        .filter(Boolean)
        .join(", "),
      description: d.message,
    }));

    const isDelivered = tracker.status === "delivered";

    return {
      success: true,
      awb,
      currentStatus: tracker.status,
      currentStatusCode: tracker.status.toUpperCase().replace(/\s+/g, "_"),
      estimatedDelivery: tracker.est_delivery_date ?? undefined,
      events,
      isDelivered,
      rawResponse: tracker,
    };
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    // EasyPost determines serviceability through rate retrieval.
    // A test shipment would be needed for a real check.
    return { serviceable: true };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const headers = this.buildHeaders(credentials);

    const res = await fetch(`${this.baseUrl}/addresses`, {
      method: "GET",
      headers,
    });

    if (res.ok) {
      return { valid: true };
    }

    return { valid: false, error: `EasyPost credential validation failed (HTTP ${res.status})` };
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    // EasyPost supports refunds via POST /shipments/{id}/refund, but requires
    // the shipment ID rather than tracking code.
    return { success: false, error: "EasyPost refund requires shipment ID lookup (not yet implemented)" };
  }
}
