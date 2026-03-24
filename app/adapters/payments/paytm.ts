import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class PaytmAdapter extends PaymentAdapter {
  readonly key = "paytm";
  readonly displayName = "Paytm";
  readonly logoUrl = "/images/payment-logos/paytm.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "mid",
      label: "Merchant ID (MID)",
      type: "text",
      required: true,
      placeholder: "Enter your Paytm Merchant ID",
    },
    {
      key: "merchantKey",
      label: "Merchant Key",
      type: "password",
      required: true,
      placeholder: "Enter your Paytm Merchant Key",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Staging", value: "staging" },
        { label: "Production", value: "production" },
      ],
    },
  ];

  private getBaseUrl(credentials: Record<string, string>): string {
    if (credentials.environment === "staging") {
      return "https://securegw-stage.paytm.in";
    }
    return "https://securegw.paytm.in";
  }

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl(credentials)}/refund/apply`;

    const refundId = `REFUND_${params.orderId}_${Date.now()}`;

    const body = {
      body: {
        mid: credentials.mid,
        txnType: "REFUND",
        orderId: params.orderId,
        txnId: params.paymentId,
        refId: refundId,
        refundAmount: String(params.amount),
      },
      head: {
        tokenType: "AES",
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;
    const responseBody = data.body as Record<string, unknown> | undefined;
    const resultInfo = responseBody?.resultInfo as Record<string, unknown> | undefined;

    if (!response.ok || resultInfo?.resultStatus !== "TXN_SUCCESS") {
      return {
        success: false,
        status: "failed",
        error:
          (resultInfo?.resultMsg as string) ?? "Refund request failed",
        rawResponse: data,
      };
    }

    return {
      success: true,
      refundId: (responseBody?.refundId as string) ?? refundId,
      status: "pending",
      amount: Number(responseBody?.refundAmount ?? params.amount),
      rawResponse: data,
    };
  }

  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl(credentials)}/v2/refund/status`;

    const body = {
      body: {
        mid: credentials.mid,
        orderId: refundId,
      },
      head: {
        tokenType: "AES",
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;
    const responseBody = data.body as Record<string, unknown> | undefined;
    const resultInfo = responseBody?.resultInfo as Record<string, unknown> | undefined;

    if (!response.ok) {
      return {
        success: false,
        status: "failed",
        error: "Failed to fetch refund status",
        rawResponse: data,
      };
    }

    const resultStatus = resultInfo?.resultStatus as string;
    let status: RefundResult["status"] = "pending";
    if (resultStatus === "TXN_SUCCESS") status = "processed";
    else if (resultStatus === "TXN_FAILURE") status = "failed";

    return {
      success: true,
      refundId: (responseBody?.refundId as string) ?? refundId,
      status,
      amount: responseBody?.refundAmount
        ? Number(responseBody.refundAmount)
        : undefined,
      rawResponse: data,
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.mid || !credentials.merchantKey) {
      return {
        valid: false,
        error: "Merchant ID and Merchant Key are required",
      };
    }

    if (!credentials.environment) {
      return { valid: false, error: "Environment must be selected" };
    }

    // Paytm doesn't offer a simple credential validation endpoint;
    // verify format constraints
    if (credentials.mid.length < 4) {
      return { valid: false, error: "Merchant ID appears invalid" };
    }

    return { valid: true };
  }

  issueStoreCredit(
    _params: StoreCreditParams,
    _credentials: Record<string, string>,
  ): Promise<StoreCreditResult> {
    return Promise.resolve({
      success: false,
      error: "Paytm does not support store credit",
    });
  }
}
