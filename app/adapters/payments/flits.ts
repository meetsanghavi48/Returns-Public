import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class FlitsAdapter extends PaymentAdapter {
  readonly key = "flits";
  readonly displayName = "Flits";
  readonly logoUrl = "/images/payment-logos/flits.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly isPartnerApp = true;
  readonly setupNote = "Install Flits app from Shopify App Store. Get API key from Flits dashboard after installation.";
  readonly setupGuideUrl = "https://www.getflits.com/";
  readonly integrationTypes = ["store_credit"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "From Flits dashboard" },
    { key: "shop_domain", label: "Shopify Store Domain", type: "text", required: true, placeholder: "yourstore.myshopify.com" },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Flits uses store credit, not direct refunds" };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.api_key) return { valid: false, error: "API Key is required" };
    if (!credentials.shop_domain) return { valid: false, error: "Shop domain is required" };
    try {
      const response = await fetch("https://api.getflits.com/api/customer/storecredit/balance", {
        headers: {
          "X-Shopify-Shop-Domain": credentials.shop_domain,
          Authorization: `Bearer ${credentials.api_key}`,
        },
      });
      if (response.ok || response.status === 404) return { valid: true };
      return { valid: false, error: `Validation failed: HTTP ${response.status}` };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  async issueStoreCredit(params: StoreCreditParams, credentials: Record<string, string>): Promise<StoreCreditResult> {
    try {
      const response = await fetch("https://api.getflits.com/api/customer/storecredit/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Shop-Domain": credentials.shop_domain,
          Authorization: `Bearer ${credentials.api_key}`,
        },
        body: JSON.stringify({
          customer_email: params.customerEmail,
          amount: params.amount,
          note: params.note || `Refund for order ${params.orderId}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.message || `HTTP ${response.status}` };
      return { success: true, creditId: data.id || `flits-${Date.now()}`, amount: params.amount };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
