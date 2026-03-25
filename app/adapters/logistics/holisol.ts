import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class HolisolAdapter extends LogisticsAdapter {
  readonly key = "holisol";
  readonly displayName = "Holisol";
  readonly region = "IN";
  readonly logoUrl = "/logos/holisol.png";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Enter your Holisol API key" },
    { key: "client_id", label: "Client ID", type: "text", required: true, placeholder: "Enter your client ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Holisol integration coming soon. Contact info@holisollogistics.com for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Holisol integration coming soon. Contact info@holisollogistics.com for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Holisol integration coming soon. Contact info@holisollogistics.com for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Holisol integration coming soon. Contact info@holisollogistics.com for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Holisol integration coming soon. Contact info@holisollogistics.com for API access.");
  }
}
