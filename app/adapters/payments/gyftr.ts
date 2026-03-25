import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class GyftrAdapter extends PaymentAdapter {
  readonly key = "gyftr";
  readonly displayName = "GyFTR";
  readonly logoUrl = "/images/payment-logos/gyftr.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly contactEmail = "Contact GYFTR via gyftr.com";
  readonly setupNote = "Contact GYFTR for API access and credentials.";
  readonly integrationTypes = ["store_credit"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true },
    { key: "client_id", label: "Client ID", type: "text", required: true },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "GyFTR uses gift cards, not direct refunds" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.api_key || !credentials.client_id || !credentials.client_secret) {
      return { valid: false, error: "All credential fields are required" };
    }
    return { valid: true };
  }

  async issueStoreCredit(params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: true, creditId: `gyftr-${Date.now()}`, amount: params.amount };
  }
}
