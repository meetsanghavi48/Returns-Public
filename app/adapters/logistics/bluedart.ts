import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class BluedartAdapter extends LogisticsAdapter {
  readonly key = "bluedart";
  readonly displayName = "Bluedart";
  readonly region = "IN";
  readonly logoUrl = "/logos/bluedart.png";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Bluedart API key",
    },
    {
      key: "loginId",
      label: "Login ID",
      type: "text",
      required: true,
      placeholder: "Enter your Bluedart login ID",
    },
    {
      key: "licenseKey",
      label: "License Key",
      type: "password",
      required: true,
      placeholder: "Enter your Bluedart license key",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Bluedart createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Bluedart trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Bluedart checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Bluedart validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Bluedart cancelPickup");
  }
}
