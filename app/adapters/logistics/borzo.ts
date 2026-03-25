import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class BorzoAdapter extends LogisticsAdapter {
  readonly key = "borzo";
  readonly displayName = "Borzo (WeFast)";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=borzo.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "Enter your Borzo API token",
    },
    {
      key: "apiUrl",
      label: "API URL",
      type: "url",
      required: true,
      placeholder: "https://robotapiuser.borzodelivery.com",
      helpText: "Borzo API base URL. Use the default unless directed otherwise.",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Borzo createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Borzo trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Borzo checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Borzo validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Borzo cancelPickup");
  }
}
