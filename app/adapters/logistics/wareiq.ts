import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class WareIQAdapter extends LogisticsAdapter {
  readonly key = "wareiq";
  readonly displayName = "WareIQ";
  readonly region = "IN";
  readonly logoUrl = "/logos/wareiq.png";
  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Enter your WareIQ API key" },
    { key: "warehouse_id", label: "Warehouse ID", type: "text", required: true, placeholder: "Enter your warehouse ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("WareIQ integration coming soon. Contact wareiq.com/contact-us for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("WareIQ integration coming soon. Contact wareiq.com/contact-us for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("WareIQ integration coming soon. Contact wareiq.com/contact-us for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("WareIQ integration coming soon. Contact wareiq.com/contact-us for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("WareIQ integration coming soon. Contact wareiq.com/contact-us for API access.");
  }
}
