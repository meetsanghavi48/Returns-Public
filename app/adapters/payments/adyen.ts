import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class AdyenAdapter extends PaymentAdapter {
  readonly key = "adyen";
  readonly displayName = "Adyen";
  readonly logoUrl = "/images/payment-logos/adyen.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;
  readonly setupGuideUrl = "https://docs.adyen.com/api-explorer/";
  readonly integrationTypes = ["refund"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "Adyen API Key from Customer Area > Developers" },
    { key: "merchant_account", label: "Merchant Account", type: "text", required: true, placeholder: "Your Adyen Merchant Account name" },
    {
      key: "environment", label: "Environment", type: "select", required: true,
      options: [{ label: "Test (Sandbox)", value: "test" }, { label: "Live (Production)", value: "live" }],
    },
  ];

  private getBaseUrl(env: string): string {
    return env === "live"
      ? "https://checkout-live.adyen.com/v71"
      : "https://checkout-test.adyen.com/v71";
  }

  async processRefund(params: RefundParams, credentials: Record<string, string>): Promise<RefundResult> {
    const baseUrl = this.getBaseUrl(credentials.environment || "test");
    try {
      const response = await fetch(`${baseUrl}/payments/${params.paymentId}/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": credentials.api_key,
        },
        body: JSON.stringify({
          merchantAccount: credentials.merchant_account,
          amount: { currency: params.currency, value: Math.round(params.amount * 100) },
          reference: `refund-${params.orderId}-${Date.now()}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, status: "failed", error: data.message || `HTTP ${response.status}`, rawResponse: data };
      }
      return {
        success: true,
        refundId: data.pspReference,
        status: data.status === "received" ? "pending" : "processed",
        amount: params.amount,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, status: "failed", error: e.message };
    }
  }

  async getRefundStatus(refundId: string, credentials: Record<string, string>): Promise<RefundResult> {
    // Adyen uses webhooks for refund status updates; polling not directly supported
    return { success: true, refundId, status: "pending", rawResponse: { note: "Use Adyen webhooks for real-time status" } };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    const mgmtUrl = credentials.environment === "live"
      ? "https://management-live.adyen.com/v3"
      : "https://management-test.adyen.com/v3";
    try {
      const response = await fetch(`${mgmtUrl}/merchants/${credentials.merchant_account}`, {
        headers: { "X-API-Key": credentials.api_key },
      });
      if (response.ok) return { valid: true };
      const data = await response.json();
      return { valid: false, error: data.message || `HTTP ${response.status}` };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  async issueStoreCredit(_params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: false, error: "Adyen does not support store credit" };
  }
}
