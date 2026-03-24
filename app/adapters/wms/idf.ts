import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class IdfAdapter extends WmsAdapter {
  readonly key = "idf";
  readonly displayName = "IDF";
  readonly logoUrl = "/integrations/idf.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your IDF API key",
    },
    {
      key: "merchantId",
      label: "Merchant ID",
      type: "text",
      required: true,
      placeholder: "Your IDF merchant ID",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "IDF adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "IDF adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "IDF adapter is not yet implemented",
    };
  }
}
