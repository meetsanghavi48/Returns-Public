import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

// API Reference: https://www.postman.com/rahulc275101/rahul/documentation/q9l8vuo/shyplite-public-collection-copy
export class ShypliteAdapter extends LogisticsAdapter {
  readonly key = "shyplite";
  readonly displayName = "Shyplite";
  readonly region = "IN";
  readonly logoUrl = "/logos/shyplite.png";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Shyplite API key",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Shyplite API secret",
    },
  ];

  // TODO: Verify base URL and endpoints from Postman collection
  private readonly baseUrl = "https://api.shyplite.com/v2";

  private async apiCall(
    method: string,
    endpoint: string,
    credentials: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
        "x-api-secret": credentials.apiSecret,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      throw new Error(`Shyplite API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    // TODO: Implement using Shyplite create order/shipment endpoint
    throw new Error("Not implemented: Shyplite createPickup — see https://www.postman.com/rahulc275101/rahul/documentation/q9l8vuo/shyplite-public-collection-copy");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    // TODO: Implement using Shyplite tracking endpoint
    throw new Error("Not implemented: Shyplite trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    // TODO: Implement using Shyplite serviceability endpoint
    throw new Error("Not implemented: Shyplite checkServiceability");
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.apiCall("GET", "/profile", credentials);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Invalid credentials",
      };
    }
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Shyplite cancelPickup");
  }
}
