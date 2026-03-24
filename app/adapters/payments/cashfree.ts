import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class CashfreeAdapter extends PaymentAdapter {
  readonly key = "cashfree";
  readonly displayName = "Cashfree";
  readonly logoUrl = "/images/payment-logos/cashfree.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "appId",
      label: "App ID",
      type: "text",
      required: true,
      placeholder: "Enter your Cashfree App ID",
    },
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Enter your Cashfree Secret Key",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Sandbox", value: "sandbox" },
        { label: "Production", value: "production" },
      ],
    },
  ];

  private getBaseUrl(credentials: Record<string, string>): string {
    if (credentials.environment === "sandbox") {
      return "https://sandbox.cashfree.com/pg";
    }
    return "https://api.cashfree.com/pg";
  }

  private getHeaders(credentials: Record<string, string>): Record<string, string> {
    return {
      "x-client-id": credentials.appId,
      "x-client-secret": credentials.secretKey,
      "x-api-version": "2023-08-01",
      "Content-Type": "application/json",
    };
  }

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl(credentials)}/orders/${params.orderId}/refunds`;

    const body = {
      refund_amount: params.amount,
      refund_id: `refund_${params.orderId}_${Date.now()}`,
      refund_note: params.reason ?? "Refund requested",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(credentials),
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      return {
        success: false,
        status: "failed",
        error: (data.message as string) ?? "Refund request failed",
        rawResponse: data,
      };
    }

    const cfStatus = data.refund_status as string;
    let status: RefundResult["status"] = "pending";
    if (cfStatus === "SUCCESS") status = "processed";
    else if (cfStatus === "CANCELLED") status = "failed";

    return {
      success: true,
      refundId: data.refund_id as string,
      status,
      amount: data.refund_amount as number,
      rawResponse: data,
    };
  }

  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    // Cashfree requires orderId in the path; we encode it in the refundId as refund_{orderId}_{ts}
    const parts = refundId.split("_");
    const orderId = parts.length >= 2 ? parts[1] : refundId;
    const url = `${this.getBaseUrl(credentials)}/orders/${orderId}/refunds/${refundId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(credentials),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      return {
        success: false,
        status: "failed",
        error: "Failed to fetch refund status",
        rawResponse: data,
      };
    }

    const cfStatus = data.refund_status as string;
    let status: RefundResult["status"] = "pending";
    if (cfStatus === "SUCCESS") status = "processed";
    else if (cfStatus === "CANCELLED") status = "failed";

    return {
      success: true,
      refundId: data.refund_id as string,
      status,
      amount: data.refund_amount as number,
      rawResponse: data,
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.appId || !credentials.secretKey) {
      return { valid: false, error: "App ID and Secret Key are required" };
    }

    try {
      const url = `${this.getBaseUrl(credentials)}/orders?count=1`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(credentials),
      });

      if (response.ok || response.status === 404) {
        return { valid: true };
      }

      return {
        valid: false,
        error: "Invalid credentials: authentication failed",
      };
    } catch (err) {
      return {
        valid: false,
        error: `Connection error: ${(err as Error).message}`,
      };
    }
  }

  issueStoreCredit(
    _params: StoreCreditParams,
    _credentials: Record<string, string>,
  ): Promise<StoreCreditResult> {
    return Promise.resolve({
      success: false,
      error: "Cashfree does not support store credit",
    });
  }
}
