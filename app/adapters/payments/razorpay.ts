import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class RazorpayAdapter extends PaymentAdapter {
  readonly key = "razorpay";
  readonly displayName = "Razorpay";
  readonly logoUrl = "/images/payment-logos/razorpay.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "keyId",
      label: "Key ID",
      type: "text",
      required: true,
      placeholder: "rzp_live_...",
      helpText: "Your Razorpay Key ID from the Dashboard",
    },
    {
      key: "keySecret",
      label: "Key Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Key Secret",
      helpText: "Your Razorpay Key Secret from the Dashboard",
    },
  ];

  private getBaseUrl(): string {
    return "https://api.razorpay.com/v1";
  }

  private getAuthHeader(credentials: Record<string, string>): string {
    const encoded = btoa(`${credentials.keyId}:${credentials.keySecret}`);
    return `Basic ${encoded}`;
  }

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/payments/${params.paymentId}/refund`;

    const body: Record<string, unknown> = {
      amount: params.amount,
      notes: {
        reason: params.reason ?? "Refund requested",
        orderId: params.orderId,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorDesc =
        (
          data.error as Record<string, unknown> | undefined
        )?.description?.toString() ?? "Unknown error";
      return {
        success: false,
        status: "failed",
        error: errorDesc,
        rawResponse: data,
      };
    }

    return {
      success: true,
      refundId: data.id as string,
      status: data.status === "processed" ? "processed" : "pending",
      amount: data.amount as number,
      rawResponse: data,
    };
  }

  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/refunds/${refundId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: this.getAuthHeader(credentials),
      },
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

    return {
      success: true,
      refundId: data.id as string,
      status: data.status === "processed" ? "processed" : "pending",
      amount: data.amount as number,
      rawResponse: data,
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.keyId || !credentials.keySecret) {
      return { valid: false, error: "Key ID and Key Secret are required" };
    }

    try {
      const url = `${this.getBaseUrl()}/payments?count=1`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(credentials),
        },
      });

      if (response.ok) {
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
      error: "Razorpay does not support store credit",
    });
  }
}
