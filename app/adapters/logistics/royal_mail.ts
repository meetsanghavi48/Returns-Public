import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class RoyalMailAdapter extends LogisticsAdapter {
  readonly key = "royal_mail";
  readonly displayName = "Royal Mail";
  readonly region = "GB";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=royalmail.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "Enter your client ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "Enter your client secret",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented");
  }
}
