import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class GLSAdapter extends LogisticsAdapter {
  readonly key = "gls";
  readonly displayName = "GLS";
  readonly region = "EU";
  readonly logoUrl = "/logos/gls.png";
  readonly credentialFields: CredentialField[] = [
    { key: "username", label: "Username", type: "text", required: true, placeholder: "Enter your GLS username" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Enter your GLS password" },
    { key: "contact_id", label: "Contact ID", type: "text", required: true, placeholder: "Enter your contact ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("GLS integration coming soon. Contact gls-group.eu for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("GLS integration coming soon. Contact gls-group.eu for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("GLS integration coming soon. Contact gls-group.eu for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("GLS integration coming soon. Contact gls-group.eu for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("GLS integration coming soon. Contact gls-group.eu for API access.");
  }
}
