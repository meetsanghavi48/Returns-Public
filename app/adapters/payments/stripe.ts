import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class StripeAdapter extends PaymentAdapter {
  readonly key = "stripe";
  readonly displayName = "Stripe";
  readonly logoUrl = "/images/payment-logos/stripe.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "sk_live_...",
      helpText: "Your Stripe Secret Key from the Dashboard",
    },
  ];

  private getBaseUrl(): string {
    return "https://api.stripe.com/v1";
  }

  private getHeaders(credentials: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  private encodeFormData(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/refunds`;

    const formData: Record<string, string> = {
      amount: String(params.amount),
    };

    // Stripe accepts either charge or payment_intent; paymentId could be either
    if (params.paymentId.startsWith("ch_")) {
      formData.charge = params.paymentId;
    } else {
      formData.payment_intent = params.paymentId;
    }

    if (params.reason) {
      formData["metadata[reason]"] = params.reason;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(credentials),
      body: this.encodeFormData(formData),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const error = data.error as Record<string, unknown> | undefined;
      return {
        success: false,
        status: "failed",
        error: (error?.message as string) ?? "Refund request failed",
        rawResponse: data,
      };
    }

    const stripeStatus = data.status as string;
    let status: RefundResult["status"] = "pending";
    if (stripeStatus === "succeeded") status = "processed";
    else if (stripeStatus === "failed" || stripeStatus === "canceled") status = "failed";

    return {
      success: true,
      refundId: data.id as string,
      status,
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
        Authorization: `Bearer ${credentials.secretKey}`,
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

    const stripeStatus = data.status as string;
    let status: RefundResult["status"] = "pending";
    if (stripeStatus === "succeeded") status = "processed";
    else if (stripeStatus === "failed" || stripeStatus === "canceled") status = "failed";

    return {
      success: true,
      refundId: data.id as string,
      status,
      amount: data.amount as number,
      rawResponse: data,
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.secretKey) {
      return { valid: false, error: "Secret Key is required" };
    }

    try {
      const url = `${this.getBaseUrl()}/balance`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentials.secretKey}`,
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
      error: "Stripe does not support store credit",
    });
  }
}
