import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class ShadowfaxAdapter extends LogisticsAdapter {
  readonly key = "shadowfax";
  readonly displayName = "Shadowfax";
  readonly region = "IN";
  readonly logoUrl = "/logos/shadowfax.png";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "Enter your Shadowfax API token",
    },
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "Enter your Shadowfax client ID",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Shadowfax createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Shadowfax trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Shadowfax checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Shadowfax validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Shadowfax cancelPickup");
  }
}
