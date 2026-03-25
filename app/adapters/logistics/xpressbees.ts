import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class XpressbeesAdapter extends LogisticsAdapter {
  readonly key = "xpressbees";
  readonly displayName = "Xpressbees";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=xpressbees.com&sz=64";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Xpressbees API key",
    },
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Enter your Xpressbees secret key",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Xpressbees createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Xpressbees trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Xpressbees checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Xpressbees validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Xpressbees cancelPickup");
  }
}
