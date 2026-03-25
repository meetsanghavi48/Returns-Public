import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class DPDUKAdapter extends LogisticsAdapter {
  readonly key = "dpd_uk";
  readonly displayName = "DPD UK";
  readonly region = "UK";
  readonly logoUrl = "/logos/dpd.png";
  readonly credentialFields: CredentialField[] = [
    { key: "username", label: "Username", type: "text", required: true, placeholder: "Enter your DPD UK username" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Enter your DPD UK password" },
    { key: "account_number", label: "Account Number", type: "text", required: true, placeholder: "Enter your account number" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("DPD UK integration coming soon. Contact api.dpd.co.uk for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("DPD UK integration coming soon. Contact api.dpd.co.uk for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("DPD UK integration coming soon. Contact api.dpd.co.uk for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("DPD UK integration coming soon. Contact api.dpd.co.uk for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("DPD UK integration coming soon. Contact api.dpd.co.uk for API access.");
  }
}
