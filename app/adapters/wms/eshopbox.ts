import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class EshopboxAdapter extends WmsAdapter {
  readonly key = "eshopbox";
  readonly displayName = "Eshopbox";
  readonly logoUrl = "/integrations/eshopbox.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your Eshopbox API key",
    },
    {
      key: "accountId",
      label: "Account ID",
      type: "text",
      required: true,
      placeholder: "Your Eshopbox account ID",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Eshopbox adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "Eshopbox adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Eshopbox adapter is not yet implemented",
    };
  }
}
