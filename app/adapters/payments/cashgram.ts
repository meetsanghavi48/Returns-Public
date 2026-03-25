import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class CashgramAdapter extends PaymentAdapter {
  readonly key = "cashgram";
  readonly displayName = "Cashgram (Cashfree Payouts)";
  readonly logoUrl = "/images/payment-logos/cashgram.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;
  readonly setupGuideUrl = "https://www.cashfree.com/docs/";
  readonly integrationTypes = ["bank_transfer"];

  readonly credentialFields: CredentialField[] = [
    { key: "client_id", label: "Client ID", type: "text", required: true, placeholder: "Cashfree Payout Client ID" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true, placeholder: "Cashfree Payout Client Secret" },
    {
      key: "environment", label: "Environment", type: "select", required: true,
      options: [{ label: "Test (Sandbox)", value: "test" }, { label: "Production", value: "production" }],
    },
  ];

  private getBaseUrl(env: string): string {
    return env === "production"
      ? "https://payout-api.cashfree.com"
      : "https://payout-gamma.cashfree.com";
  }

  private async authorize(credentials: Record<string, string>): Promise<string | null> {
    const baseUrl = this.getBaseUrl(credentials.environment || "test");
    try {
      const response = await fetch(`${baseUrl}/payout/v1/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": credentials.client_id,
          "X-Client-Secret": credentials.client_secret,
        },
      });
      const data = await response.json();
      if (data.status === "SUCCESS" && data.data?.token) return data.data.token;
      return null;
    } catch {
      return null;
    }
  }

  async processRefund(params: RefundParams, credentials: Record<string, string>): Promise<RefundResult> {
    const baseUrl = this.getBaseUrl(credentials.environment || "test");
    const token = await this.authorize(credentials);
    if (!token) return { success: false, status: "failed", error: "Authorization failed" };

    try {
      const cashgramId = `cg-${params.orderId}-${Date.now()}`;
      const response = await fetch(`${baseUrl}/payout/v1/cashgram/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cashgramId,
          amount: params.amount,
          remarks: params.reason || `Refund for order ${params.orderId}`,
          notifyCustomer: true,
          beneDetails: {
            email: params.customerEmail || "",
            phone: params.customerPhone || "",
            name: params.metadata?.customerName || "Customer",
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "SUCCESS") {
        return { success: false, status: "failed", error: data.message || `HTTP ${response.status}`, rawResponse: data };
      }
      return {
        success: true,
        refundId: cashgramId,
        status: "pending",
        amount: params.amount,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, status: "failed", error: e.message };
    }
  }

  async getRefundStatus(refundId: string, credentials: Record<string, string>): Promise<RefundResult> {
    const baseUrl = this.getBaseUrl(credentials.environment || "test");
    const token = await this.authorize(credentials);
    if (!token) return { success: false, status: "failed", error: "Authorization failed" };

    try {
      const response = await fetch(`${baseUrl}/payout/v1/cashgram/${refundId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      const statusMap: Record<string, "processed" | "pending" | "failed"> = {
        REDEEMED: "processed", ACTIVE: "pending", EXPIRED: "failed",
      };
      return {
        success: response.ok,
        refundId,
        status: statusMap[data.data?.cashgramStatus] || "pending",
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, status: "failed", error: e.message };
    }
  }

  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    const token = await this.authorize(credentials);
    if (token) return { valid: true };
    return { valid: false, error: "Authorization failed. Check Client ID and Client Secret." };
  }

  async issueStoreCredit(_params: StoreCreditParams, _credentials: Record<string, string>): Promise<StoreCreditResult> {
    return { success: false, error: "Cashgram does not support store credit" };
  }
}
