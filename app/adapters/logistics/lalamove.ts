import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class LalamoveAdapter extends LogisticsAdapter {
  readonly key = "lalamove";
  readonly displayName = "Lalamove";
  readonly region = "global";
  readonly logoUrl = "/logos/lalamove.svg";

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Lalamove API key",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Lalamove API secret",
    },
    {
      key: "market",
      label: "Market",
      type: "select",
      required: true,
      helpText: "Select the market/region for Lalamove operations.",
      options: [
        { label: "India", value: "IN" },
        { label: "Malaysia", value: "MY" },
        { label: "Singapore", value: "SG" },
        { label: "Thailand", value: "TH" },
        { label: "Philippines", value: "PH" },
        { label: "Vietnam", value: "VN" },
        { label: "Indonesia", value: "ID" },
        { label: "Hong Kong", value: "HK" },
        { label: "Taiwan", value: "TW" },
      ],
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Lalamove createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Lalamove trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Lalamove checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Lalamove validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Lalamove cancelPickup");
  }
}
