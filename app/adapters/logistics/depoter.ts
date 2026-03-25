import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class DepoterAdapter extends LogisticsAdapter {
  readonly key = "depoter";
  readonly displayName = "Depoter";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=depoter.com&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "text", required: true, placeholder: "Enter your API key" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Depoter integration coming soon.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Depoter integration coming soon.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Depoter integration coming soon.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Depoter integration coming soon.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Depoter integration coming soon.");
  }
}
