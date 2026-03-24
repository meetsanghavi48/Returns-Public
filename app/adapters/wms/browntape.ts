import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class BrowntapeAdapter extends WmsAdapter {
  readonly key = "browntape";
  readonly displayName = "Browntape";
  readonly logoUrl = "/integrations/browntape.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your Browntape API key",
    },
    {
      key: "channelId",
      label: "Channel ID",
      type: "text",
      required: true,
      placeholder: "Your Browntape channel ID",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Browntape adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "Browntape adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Browntape adapter is not yet implemented",
    };
  }
}
