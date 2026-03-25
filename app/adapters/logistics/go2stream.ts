import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class Go2StreamAdapter extends LogisticsAdapter {
  readonly key = "go2stream";
  readonly displayName = "Go2Stream";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=go2stream.com&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "text", required: true, placeholder: "Enter your API key" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Go2Stream integration coming soon.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Go2Stream integration coming soon.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Go2Stream integration coming soon.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Go2Stream integration coming soon.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Go2Stream integration coming soon.");
  }
}
