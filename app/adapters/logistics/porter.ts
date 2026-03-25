import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class PorterAdapter extends LogisticsAdapter {
  readonly key = "porter";
  readonly displayName = "Porter";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=porter.in&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Porter API key",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Porter API secret",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Porter createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Porter trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Porter checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Porter validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Porter cancelPickup");
  }
}
