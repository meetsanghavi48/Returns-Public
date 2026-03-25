import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class ProshipAdapter extends LogisticsAdapter {
  readonly key = "proship";
  readonly displayName = "Proship";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=proship.in&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Enter your Proship API key" },
    { key: "client_code", label: "Client Code", type: "text", required: true, placeholder: "Enter your client code" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Proship integration coming soon. Contact proship.in for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Proship integration coming soon. Contact proship.in for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Proship integration coming soon. Contact proship.in for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Proship integration coming soon. Contact proship.in for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Proship integration coming soon. Contact proship.in for API access.");
  }
}
