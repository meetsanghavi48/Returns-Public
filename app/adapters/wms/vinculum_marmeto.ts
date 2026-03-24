import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class VinculumMarmetoAdapter extends WmsAdapter {
  readonly key = "vinculum_marmeto";
  readonly displayName = "Vinculum (Marmeto)";
  readonly logoUrl = "/integrations/vinculum-marmeto.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your Vinculum Marmeto API key",
    },
    {
      key: "shopDomain",
      label: "Shop Domain",
      type: "text",
      required: true,
      placeholder: "your-store.myshopify.com",
      helpText: "The Shopify domain linked to your Vinculum Marmeto account",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Vinculum (Marmeto) adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "Vinculum (Marmeto) adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Vinculum (Marmeto) adapter is not yet implemented",
    };
  }
}
