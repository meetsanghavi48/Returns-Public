import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class TransbnkAdapter extends PaymentAdapter {
  readonly key = "transbnk";
  readonly displayName = "TransBnk";
  readonly logoUrl = "/images/payment-logos/transbnk.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;
  readonly contactEmail = "Contact via transbnk.co.in";
  readonly setupNote = "Contact TransBnk for API access and credentials.";
  readonly integrationTypes = ["bank_transfer"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true },
    { key: "merchant_id", label: "Merchant ID", type: "text", required: true },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Contact TransBnk for API integration" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Contact TransBnk for API integration" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.api_key || !credentials.merchant_id) {
      return { valid: false, error: "API Key and Merchant ID are required" };
    }
    return { valid: true };
  }

  async issueStoreCredit(_params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: false, error: "TransBnk does not support store credit" };
  }
}
