import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class YotpoAdapter extends PaymentAdapter {
  readonly key = "yotpo";
  readonly displayName = "Yotpo Loyalty";
  readonly logoUrl = "/images/payment-logos/yotpo.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;
  readonly setupGuideUrl = "https://loyaltyapi.yotpo.com/reference/introduction-1";
  readonly integrationTypes = ["loyalty"];

  readonly credentialFields: CredentialField[] = [
    { key: "api_key", label: "API Key", type: "text", required: true, placeholder: "From Yotpo Dashboard > Settings > General Settings", helpText: "Copy API Key from Yotpo Dashboard" },
    { key: "guid", label: "GUID", type: "text", required: true, placeholder: "From Yotpo Dashboard > Settings > General Settings", helpText: "Copy GUID from Yotpo Dashboard" },
  ];

  async processRefund(_params: RefundParams, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Yotpo uses loyalty points, not direct refunds. Use issueStoreCredit instead." };
  }

  async getRefundStatus(_refundId: string, _credentials: Record<string, string>): Promise<RefundResult> {
    return { success: false, status: "failed", error: "Not applicable for loyalty points" };
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch("https://loyalty.yotpo.com/api/v2/customers/count", {
        headers: {
          "x-api-key": credentials.api_key,
          "x-guid": credentials.guid,
        },
      });
      if (response.ok) return { valid: true };
      return { valid: false, error: `HTTP ${response.status}: Invalid API Key or GUID` };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  async issueStoreCredit(params: StoreCreditParams, credentials: Record<string, string>): Promise<StoreCreditResult> {
    try {
      const response = await fetch(
        `https://loyalty.yotpo.com/api/v2/customers/${encodeURIComponent(params.customerEmail)}/loyalty_points/adjustments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": credentials.api_key,
            "x-guid": credentials.guid,
          },
          body: JSON.stringify({
            points_to_add: Math.round(params.amount),
            note: params.note || `Return refund for order ${params.orderId}`,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }
      return {
        success: true,
        creditId: data.id || `yotpo-${Date.now()}`,
        amount: params.amount,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
