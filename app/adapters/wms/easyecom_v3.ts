import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class EasyecomV3Adapter extends WmsAdapter {
  readonly key = "easyecom_v3";
  readonly displayName = "EasyEcom V3";
  readonly logoUrl = "/integrations/easyecom.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your EasyEcom V3 API key",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      placeholder: "Your EasyEcom V3 API secret",
    },
    {
      key: "companyId",
      label: "Company ID",
      type: "text",
      required: true,
      placeholder: "Your EasyEcom company ID",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "EasyEcom V3 adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "EasyEcom V3 adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "EasyEcom V3 adapter is not yet implemented",
    };
  }
}
