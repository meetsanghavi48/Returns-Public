import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class NectorLoyaltyWalletAdapter extends PaymentAdapter {
  readonly key = "nector_loyalty_wallet";
  readonly displayName = "Nector Loyalty Wallet";
  readonly logoUrl = "/images/payment-logos/nector.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly isPartnerApp = true;
  readonly setupNote = "Install the Nector app from Shopify App Store. Get Wallet API Key from your Nector dashboard.";
  readonly setupGuideUrl = "https://www.nector.io/";
  readonly integrationTypes = ["loyalty", "store_credit"];

  readonly credentialFields: CredentialField[] = [
    { key: "shop_domain", label: "Shopify Store Domain", type: "text", required: true, placeholder: "yourstore.myshopify.com" },
    { key: "wallet_api_key", label: "Wallet API Key", type: "password", required: true, placeholder: "From Nector dashboard" },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Nector Wallet uses loyalty points, not direct refunds" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.shop_domain || !credentials.wallet_api_key) {
      return { valid: false, error: "Both fields are required" };
    }
    if (!credentials.shop_domain.includes(".myshopify.com")) {
      return { valid: false, error: "Enter a valid Shopify store domain" };
    }
    return { valid: true };
  }

  async issueStoreCredit(params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: true, creditId: `nector-wallet-${Date.now()}`, amount: params.amount };
  }
}
