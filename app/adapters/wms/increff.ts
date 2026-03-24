import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

export class IncreffAdapter extends WmsAdapter {
  readonly key = "increff";
  readonly displayName = "Increff";
  readonly logoUrl = "/integrations/increff.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      placeholder: "Your Increff API key",
    },
    {
      key: "warehouseId",
      label: "Warehouse ID",
      type: "text",
      required: true,
      placeholder: "Your Increff warehouse ID",
    },
  ];

  async syncReturnToWms(
    _params: WmsReturnParams,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Increff adapter is not yet implemented",
    };
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    return {
      valid: false,
      error: "Increff adapter is not yet implemented",
    };
  }

  async getReturnStatus(
    _wmsReturnId: string,
    _credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    return {
      success: false,
      error: "Increff adapter is not yet implemented",
    };
  }
}
