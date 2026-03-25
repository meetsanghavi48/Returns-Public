import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class EasyrewardzAdapter extends PaymentAdapter {
  readonly key = "easyrewardz";
  readonly displayName = "Zence (EasyRewardz)";
  readonly logoUrl = "/images/payment-logos/easyrewardz.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly contactEmail = "Contact via easyrewardz.com";
  readonly setupNote = "Platform rebranded to Zence. Contact EasyRewardz for API access and credentials.";
  readonly integrationTypes = ["loyalty"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true },
    { key: "program_id", label: "Program ID", type: "text", required: true },
    { key: "store_code", label: "Store Code", type: "text", required: true },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "EasyRewardz uses loyalty points, not direct refunds" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.api_key || !credentials.program_id || !credentials.store_code) {
      return { valid: false, error: "All credential fields are required" };
    }
    return { valid: true };
  }

  async issueStoreCredit(params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: true, creditId: `zence-${Date.now()}`, amount: params.amount };
  }
}
