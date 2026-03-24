import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class PayUAdapter extends PaymentAdapter {
  readonly key = "payu";
  readonly displayName = "PayU";
  readonly logoUrl = "/images/payment-logos/payu.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "merchantKey",
      label: "Merchant Key",
      type: "text",
      required: true,
      placeholder: "Enter your PayU Merchant Key",
    },
    {
      key: "merchantSalt",
      label: "Merchant Salt",
      type: "password",
      required: true,
      placeholder: "Enter your PayU Merchant Salt",
    },
  ];

  private getBaseUrl(): string {
    return "https://info.payu.in/merchant";
  }

  private encodeFormData(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  private async computeHash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/postservice`;

    const command = "cancel_refund_transaction";
    const hashString = `${credentials.merchantKey}|${command}|${params.paymentId}|${credentials.merchantSalt}`;
    const hash = await this.computeHash(hashString);

    const formData: Record<string, string> = {
      key: credentials.merchantKey,
      command,
      var1: params.paymentId,
      var2: String(params.amount),
      var3: params.reason ?? "Refund requested",
      hash,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.encodeFormData(formData),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok || (data.status as number) === 0) {
      return {
        success: false,
        status: "failed",
        error: (data.msg as string) ?? "Refund request failed",
        rawResponse: data,
      };
    }

    return {
      success: true,
      refundId: (data.request_id as string) ?? params.paymentId,
      status: "pending",
      amount: params.amount,
      rawResponse: data,
    };
  }

  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/postservice`;

    const command = "check_action_status";
    const hashString = `${credentials.merchantKey}|${command}|${refundId}|${credentials.merchantSalt}`;
    const hash = await this.computeHash(hashString);

    const formData: Record<string, string> = {
      key: credentials.merchantKey,
      command,
      var1: refundId,
      hash,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.encodeFormData(formData),
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

    const txnStatus = (data.status as string)?.toLowerCase();
    let status: RefundResult["status"] = "pending";
    if (txnStatus === "success") status = "processed";
    else if (txnStatus === "failure" || txnStatus === "failed") status = "failed";

    return {
      success: true,
      refundId,
      status,
      rawResponse: data,
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.merchantKey || !credentials.merchantSalt) {
      return {
        valid: false,
        error: "Merchant Key and Merchant Salt are required",
      };
    }

    // PayU doesn't have a simple validation endpoint;
    // we verify the credentials format is reasonable
    if (credentials.merchantKey.length < 4) {
      return { valid: false, error: "Merchant Key appears invalid" };
    }

    return { valid: true };
  }

  issueStoreCredit(
    _params: StoreCreditParams,
    _credentials: Record<string, string>,
  ): Promise<StoreCreditResult> {
    return Promise.resolve({
      success: false,
      error: "PayU does not support store credit",
    });
  }
}
