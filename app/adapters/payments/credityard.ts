import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class CredityardAdapter extends PaymentAdapter {
  readonly key = "credityard";
  readonly displayName = "CreditsYard";
  readonly logoUrl = "/images/payment-logos/credityard.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly isPartnerApp = true;
  readonly setupNote = "Install CreditsYard app from Shopify App Store. Store credits are issued directly to customers automatically.";
  readonly setupGuideUrl = "https://apps.shopify.com/my-store-credit";
  readonly integrationTypes = ["store_credit"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "From CreditsYard dashboard" },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "CreditsYard uses store credit, not direct refunds" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.api_key) return { valid: false, error: "API Key is required" };
    return { valid: true };
  }

  async issueStoreCredit(params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: true, creditId: `credityard-${Date.now()}`, amount: params.amount };
  }
}
