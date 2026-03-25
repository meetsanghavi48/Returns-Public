import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class ShopfloAdapter extends PaymentAdapter {
  readonly key = "shopflo";
  readonly displayName = "Shopflo";
  readonly logoUrl = "/images/payment-logos/shopflo.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;
  readonly setupNote = "Create a custom app in Shopify Partner Dashboard. Send both tokens to golive@shopflo.com for setup completion.";
  readonly setupGuideUrl = "https://www.shopflo.com/help/token-api";
  readonly integrationTypes = ["refund"];

  readonly credentialFields: CredentialField[] = [
    { key: "storefront_token", label: "Storefront API Token", type: "password", required: true, placeholder: "From custom Shopify app" },
    { key: "admin_token", label: "Admin API Token", type: "password", required: true, placeholder: "From custom Shopify app" },
    { key: "shop_domain", label: "Shopify Store Domain", type: "text", required: true, placeholder: "yourstore.myshopify.com" },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Shopflo refunds are processed via their checkout integration" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Contact Shopflo for refund status" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.storefront_token || !credentials.admin_token || !credentials.shop_domain) {
      return { valid: false, error: "All fields are required" };
    }
    return { valid: true };
  }

  async issueStoreCredit(_params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: false, error: "Shopflo does not support store credit" };
  }
}
