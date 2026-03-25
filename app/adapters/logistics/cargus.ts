import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class CargusAdapter extends LogisticsAdapter {
  readonly key = "cargus";
  readonly displayName = "Cargus";
  readonly region = "RO";
  readonly logoUrl = "/logos/cargus.png";
  readonly credentialFields: CredentialField[] = [
    { key: "username", label: "Username", type: "text", required: true, placeholder: "Enter your Cargus username" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Enter your Cargus password" },
    { key: "client_id", label: "Client ID", type: "text", required: true, placeholder: "Enter your client ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Cargus integration coming soon. Contact cargus.ro for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Cargus integration coming soon. Contact cargus.ro for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Cargus integration coming soon. Contact cargus.ro for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Cargus integration coming soon. Contact cargus.ro for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Cargus integration coming soon. Contact cargus.ro for API access.");
  }
}
