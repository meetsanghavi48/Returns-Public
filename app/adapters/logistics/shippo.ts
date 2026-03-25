import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  TrackingEvent,
  ServiceabilityResult,
} from "./base";

interface ShippoAddress {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
}

interface ShippoParcel {
  length: string;
  width: string;
  height: string;
  distance_unit: string;
  weight: string;
  mass_unit: string;
}

interface ShippoShipmentResponse {
  object_id: string;
  rates: Array<{
    object_id: string;
    amount: string;
    currency: string;
    provider: string;
    servicelevel: { name: string; token: string };
    estimated_days: number;
  }>;
  status: string;
  messages: Array<{ text: string }>;
}

interface ShippoTransactionResponse {
  object_id: string;
  status: string;
  tracking_number: string;
  tracking_url_provider: string;
  label_url: string;
  messages: Array<{ text: string }>;
}

interface ShippoTrackingResponse {
  tracking_number: string;
  tracking_status: {
    status: string;
    status_details: string;
    status_date: string;
    location: {
      city: string;
      state: string;
      country: string;
    };
  } | null;
  tracking_history: Array<{
    status: string;
    status_details: string;
    status_date: string;
    location: {
      city: string;
      state: string;
      country: string;
    };
  }>;
  eta: string | null;
}

export class ShippoAdapter extends LogisticsAdapter {
  readonly key = "shippo";
  readonly displayName = "Shippo";
  readonly region = "global";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=goshippo.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "Enter your Shippo API token",
      helpText: "Found in Shippo dashboard under Settings > API",
    },
  ];

  private readonly baseUrl = "https://api.goshippo.com";

  private buildHeaders(credentials: Record<string, string>): Record<string, string> {
    return {
      Authorization: `ShippoToken ${credentials.apiToken}`,
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
  ): ShippoAddress {
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

    const addressFrom = this.buildAddress(
      params.senderName,
      params.senderPhone,
      params.senderAddress,
      params.senderCity,
      params.senderState,
      params.senderPincode,
      params.senderCountry,
    );

    const addressTo = this.buildAddress(
      params.receiverName,
      params.receiverPhone,
      params.receiverAddress,
      params.receiverCity,
      params.receiverState,
      params.receiverPincode,
      params.receiverCountry,
    );

    const parcel: ShippoParcel = {
      length: String(params.length ?? 10),
      width: String(params.breadth ?? 10),
      height: String(params.height ?? 10),
      distance_unit: "cm",
      weight: String(params.weight),
      mass_unit: "g",
    };

    // Step 1: Create shipment
    const shipmentRes = await fetch(`${this.baseUrl}/shipments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        address_from: addressFrom,
        address_to: addressTo,
        parcels: [parcel],
        async: false,
      }),
    });

    if (!shipmentRes.ok) {
      const errorBody = await shipmentRes.text();
      return { success: false, error: `Shippo shipment creation failed: ${errorBody}` };
    }

    const shipment: ShippoShipmentResponse = await shipmentRes.json();

    if (!shipment.rates || shipment.rates.length === 0) {
      return {
        success: false,
        error: "No shipping rates returned by Shippo",
        rawResponse: shipment,
      };
    }

    // Pick the first rate
    const selectedRate = shipment.rates[0];

    // Step 2: Create transaction (purchase label)
    const transactionRes = await fetch(`${this.baseUrl}/transactions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        rate: selectedRate.object_id,
        async: false,
      }),
    });

    if (!transactionRes.ok) {
      const errorBody = await transactionRes.text();
      return { success: false, error: `Shippo transaction failed: ${errorBody}` };
    }

    const transaction: ShippoTransactionResponse = await transactionRes.json();

    if (transaction.status !== "SUCCESS") {
      const msgs = transaction.messages.map((m) => m.text).join("; ");
      return {
        success: false,
        error: `Shippo label purchase failed: ${msgs}`,
        rawResponse: transaction,
      };
    }

    return {
      success: true,
      awb: transaction.tracking_number,
      trackingUrl: transaction.tracking_url_provider,
      labelUrl: transaction.label_url,
      rawResponse: transaction,
    };
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const headers = this.buildHeaders(credentials);

    // Shippo track endpoint requires carrier token; use generic "shippo" carrier for parcels
    // shipped through Shippo. For specific carriers, the caller would need to provide carrier info.
    const res = await fetch(`${this.baseUrl}/tracks/shippo/${awb}`, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return {
        success: false,
        awb,
        currentStatus: "unknown",
        currentStatusCode: "UNKNOWN",
        events: [],
        isDelivered: false,
        error: `Shippo tracking failed: ${errorBody}`,
      };
    }

    const data: ShippoTrackingResponse = await res.json();

    const events: TrackingEvent[] = data.tracking_history.map((h) => ({
      timestamp: h.status_date,
      status: h.status,
      statusCode: h.status.toUpperCase(),
      location: [h.location.city, h.location.state, h.location.country]
        .filter(Boolean)
        .join(", "),
      description: h.status_details,
    }));

    const currentStatus = data.tracking_status?.status ?? "UNKNOWN";
    const isDelivered = currentStatus.toUpperCase() === "DELIVERED";

    return {
      success: true,
      awb,
      currentStatus,
      currentStatusCode: currentStatus.toUpperCase(),
      estimatedDelivery: data.eta ?? undefined,
      events,
      isDelivered,
      rawResponse: data,
    };
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    // Shippo doesn't have a direct serviceability check — rates retrieval acts as a proxy.
    // For a full check, create a test shipment. Returning serviceable by default.
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

    return { valid: false, error: `Shippo credential validation failed (HTTP ${res.status})` };
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    // Shippo supports voiding labels via POST /transactions/{id}/void, but requires
    // the transaction object_id rather than AWB. A real implementation would need
    // to store and look up the transaction ID.
    return { success: false, error: "Shippo label cancellation requires transaction ID lookup (not yet implemented)" };
  }
}
