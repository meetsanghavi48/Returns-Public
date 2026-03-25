import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class EnviaAdapter extends LogisticsAdapter {
  readonly key = "envia";
  readonly displayName = "Envia";
  readonly region = "IN";
  readonly logoUrl = "/logos/envia.png";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Enter your Envia API key" },
    { key: "sender_id", label: "Sender ID", type: "text", required: true, placeholder: "Enter your sender ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Envia integration coming soon. Contact envia.com for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Envia integration coming soon. Contact envia.com for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Envia integration coming soon. Contact envia.com for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Envia integration coming soon. Contact envia.com for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Envia integration coming soon. Contact envia.com for API access.");
  }
}
