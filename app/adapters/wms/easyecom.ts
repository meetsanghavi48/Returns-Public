import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class EasyecomAdapter extends WmsAdapter {
  readonly key = "easyecom";
  readonly displayName = "EasyEcom";
  readonly logoUrl = "/integrations/easyecom.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your EasyEcom API key",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Your EasyEcom API secret",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "EasyEcom adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "EasyEcom adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "EasyEcom adapter is not yet implemented",
    };
  }
}
