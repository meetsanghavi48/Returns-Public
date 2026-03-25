import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class TapAdapter extends PaymentAdapter {
  readonly key = "tap";
  readonly displayName = "Tap (MENA)";
  readonly logoUrl = "/images/payment-logos/tap.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;
  readonly setupGuideUrl = "https://developers.tap.company/";
  readonly integrationTypes = ["refund"];

  readonly credentialFields: CredentialField[] = [
    { key: "secret_key", label: "Secret API Key", type: "password", required: true, placeholder: "sk_test_... or sk_live_...", helpText: "From Tap Dashboard > goSell > API Keys" },
    { key: "publishable_key", label: "Publishable Key", type: "text", required: false, placeholder: "pk_test_... or pk_live_..." },
  ];

  async processRefund(params: RefundParams, credentials: Record<string, string>): Promise<RefundResult> {
    try {
      const response = await fetch("https://api.tap.company/v2/refunds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.secret_key}`,
        },
        body: JSON.stringify({
          charge_id: params.paymentId,
          amount: params.amount,
          currency: params.currency,
          reason: params.reason || "Return refund",
          metadata: { orderId: params.orderId },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, status: "failed", error: data.errors?.[0]?.description || data.message || `HTTP ${response.status}`, rawResponse: data };
      }
      return {
        success: true,
        refundId: data.id,
        status: data.status === "CAPTURED" ? "processed" : "pending",
        amount: data.amount,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, status: "failed", error: e.message };
    }
  }

  async getRefundStatus(refundId: string, credentials: Record<string, string>): Promise<RefundResult> {
    try {
      const response = await fetch(`https://api.tap.company/v2/refunds/${refundId}`, {
        headers: { Authorization: `Bearer ${credentials.secret_key}` },
      });
      const data = await response.json();
      return {
        success: response.ok,
        refundId: data.id,
        status: data.status === "CAPTURED" ? "processed" : data.status === "PENDING" ? "pending" : "failed",
        amount: data.amount,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, status: "failed", error: e.message };
    }
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch("https://api.tap.company/v2/accounts/info", {
        headers: { Authorization: `Bearer ${credentials.secret_key}` },
      });
      if (response.ok) return { valid: true };
      const data = await response.json();
      return { valid: false, error: data.errors?.[0]?.description || `HTTP ${response.status}` };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  async issueStoreCredit(_params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: false, error: "Tap does not support store credit" };
  }
}
