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
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=cargus.ro&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "username", label: "Web Express Account Username", type: "text", required: true, placeholder: "Enter your username" },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Enter your password" },
    { key: "primary_key", label: "Primary Key", type: "password", required: true, placeholder: "Enter your primary key" },
    { key: "service", label: "Service", type: "select", required: true,
      options: [
        { label: "Economic Standard", value: "economic_standard" },
        { label: "Standard", value: "standard" },
        { label: "Matinal", value: "matinal" },
        { label: "International rutier", value: "international_rutier" },
        { label: "International aerian", value: "international_aerian" },
      ] },
    { key: "package_length", label: "Package Length (cm)", type: "number", required: true, placeholder: "Enter length" },
    { key: "package_width", label: "Package Width (cm)", type: "number", required: true, placeholder: "Enter width" },
    { key: "package_height", label: "Package Height (cm)", type: "number", required: true, placeholder: "Enter height" },
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
