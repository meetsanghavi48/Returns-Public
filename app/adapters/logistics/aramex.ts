import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class AramexAdapter extends LogisticsAdapter {
  readonly key = "aramex";
  readonly displayName = "Aramex";
  readonly region = "GCC";
  readonly logoUrl = "/logos/aramex.svg";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your password",
    },
    {
      key: "accountNumber",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your account number",
    },
    {
      key: "accountPin",
      label: "Account PIN",
      type: "password",
      required: true,
      placeholder: "Enter your account PIN",
    },
    {
      key: "accountEntity",
      label: "Account Entity",
      type: "text",
      required: true,
      placeholder: "Enter your account entity",
    },
    {
      key: "accountCountryCode",
      label: "Account Country Code",
      type: "text",
      required: true,
      placeholder: "Enter your account country code",
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
