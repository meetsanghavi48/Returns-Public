import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class OnlineXpressAdapter extends LogisticsAdapter {
  readonly key = "onlinexpress";
  readonly displayName = "OnlineXpress";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=onlinexpress.in&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Enter your OnlineXpress API key" },
    { key: "client_id", label: "Client ID", type: "text", required: true, placeholder: "Enter your client ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("OnlineXpress integration coming soon. Contact onlinexpress.in for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("OnlineXpress integration coming soon. Contact onlinexpress.in for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("OnlineXpress integration coming soon. Contact onlinexpress.in for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("OnlineXpress integration coming soon. Contact onlinexpress.in for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("OnlineXpress integration coming soon. Contact onlinexpress.in for API access.");
  }
}
