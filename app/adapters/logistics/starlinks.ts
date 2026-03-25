import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class StarlinksAdapter extends LogisticsAdapter {
  readonly key = "starlinks";
  readonly displayName = "Starlinks";
  readonly region = "global";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=starlinks.ae&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Starlinks API key",
    },
    {
      key: "accountId",
      label: "Account ID",
      type: "text",
      required: true,
      placeholder: "Enter your account ID",
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
