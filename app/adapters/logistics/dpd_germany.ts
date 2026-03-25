import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class DPDGermanyAdapter extends LogisticsAdapter {
  readonly key = "dpd_germany";
  readonly displayName = "DPD Germany";
  readonly region = "DE";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=dpd.com&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "username", label: "Username", type: "text", required: true, placeholder: "Enter your DPD Germany username" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Enter your DPD Germany password" },
    { key: "depot_number", label: "Depot Number", type: "text", required: true, placeholder: "Enter your depot number" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("DPD Germany integration coming soon. Contact dpd.com/de for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("DPD Germany integration coming soon. Contact dpd.com/de for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("DPD Germany integration coming soon. Contact dpd.com/de for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("DPD Germany integration coming soon. Contact dpd.com/de for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("DPD Germany integration coming soon. Contact dpd.com/de for API access.");
  }
}
