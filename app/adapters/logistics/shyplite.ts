import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
  type AdapterMeta,
} from "./base";

// API Reference: https://www.postman.com/rahulc275101/rahul/documentation/q9l8vuo/shyplite-public-collection-copy
export class ShypliteAdapter extends LogisticsAdapter {
  readonly key = "shyplite";
  readonly displayName = "Shyplite";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=shyplite.com&sz=64";
  readonly meta: AdapterMeta = {
    setupGuideUrl: "https://www.postman.com/rahulc275101/rahul/documentation/q9l8vuo/shyplite-public-collection-copy",
  };
  readonly credentialFields: CredentialField[] = [
    {
      key: "seller_id",
      label: "Seller Id",
      type: "text",
      required: true,
      placeholder: "Enter your seller id",
    },
    {
      key: "public_key",
      label: "Public Key",
      type: "password",
      required: true,
      placeholder: "Enter your public key",
    },
    {
      key: "app_id",
      label: "App ID",
      type: "text",
      required: true,
      placeholder: "Enter your app id",
    },
    {
      key: "private_key",
      label: "Private Key",
      type: "password",
      required: true,
      placeholder: "Enter your private key",
      helpText: "Shyplite requires you to use both warehouse name and id. Format: warehousename:warehouseid",
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
