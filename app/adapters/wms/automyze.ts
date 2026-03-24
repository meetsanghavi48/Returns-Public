import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class AutomyzeAdapter extends WmsAdapter {
  readonly key = "automyze";
  readonly displayName = "Automyze";
  readonly logoUrl = "/integrations/automyze.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your Automyze API key",
    },
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Your Automyze secret key",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Automyze adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "Automyze adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Automyze adapter is not yet implemented",
    };
  }
}
