import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

export class ShipdelightAdapter extends LogisticsAdapter {
  readonly key = "shipdelight";
  readonly displayName = "Shipdelight";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=shipdelight.com&sz=64";
  readonly credentialFields: CredentialField[] = [
    { key: "api_token", label: "API Token", type: "password", required: true, placeholder: "Enter your Shipdelight API token" },
    { key: "seller_id", label: "Seller ID", type: "text", required: true, placeholder: "Enter your seller ID" },
  ];

  async createPickup(_params: PickupParams, _credentials: Record<string, string>): Promise<PickupResult> {
    throw new Error("Shipdelight integration coming soon. Contact customersupport@shipdelight.com for API access.");
  }

  async trackShipment(_awb: string, _credentials: Record<string, string>): Promise<TrackingResult> {
    throw new Error("Shipdelight integration coming soon. Contact customersupport@shipdelight.com for API access.");
  }

  async checkServiceability(_originPin: string, _destPin: string, _credentials: Record<string, string>): Promise<ServiceabilityResult> {
    throw new Error("Shipdelight integration coming soon. Contact customersupport@shipdelight.com for API access.");
  }

  async validateCredentials(_credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Shipdelight integration coming soon. Contact customersupport@shipdelight.com for API access.");
  }

  async cancelPickup(_awb: string, _credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    throw new Error("Shipdelight integration coming soon. Contact customersupport@shipdelight.com for API access.");
  }
}
