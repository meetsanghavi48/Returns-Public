import crypto from "crypto";
import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

interface EasebuzzRefundResponse {
  status: number;
  data: {
    txnid: string;
    refund_amount: string;
    refund_id?: string;
    status: string;
  };
  msg?: string;
}

interface EasebuzzTransactionResponse {
  status: number;
  msg: string;
  data: {
    txnid: string;
    amount: string;
    status: string;
    refund_status?: string;
    refund_amount?: string;
    firstname?: string;
    email?: string;
    phone?: string;
    productinfo?: string;
  };
}

export class EasebuzzAdapter extends PaymentAdapter {
  readonly key = "easebuzz";
  readonly displayName = "Easebuzz";
  readonly logoUrl = "/images/payment-logos/easebuzz.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "key",
      label: "Key",
      type: "text",
      required: true,
      placeholder: "Enter your Easebuzz Key",
      helpText: "Merchant key provided by Easebuzz",
    },
    {
      key: "salt",
      label: "Salt",
      type: "password",
      required: true,
      placeholder: "Enter your Easebuzz Salt",
      helpText: "Merchant salt (keep secret)",
    },
    {
      key: "merchantId",
      label: "Merchant ID",
      type: "text",
      required: true,
      placeholder: "Enter your Easebuzz Merchant ID",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Test", value: "test" },
        { label: "Production", value: "production" },
      ],
    },
  ];

  /**
   * Dashboard base URL used for refund, transaction status, etc.
   * Payment initiation uses a different subdomain (pay.easebuzz.in),
   * but that is handled in payments.server.ts, not here.
   */
  private getDashboardBaseUrl(credentials: Record<string, string>): string {
    return credentials.environment === "production"
      ? "https://dashboard.easebuzz.in"
      : "https://testdashboard.easebuzz.in";
  }

  /**
   * Generate SHA-512 hash from a pipe-delimited string.
   * Easebuzz requires: join fields with "|", append salt, then sha512.
   */
  private generateHash(fields: string[], salt: string): string {
    const hashInput = [...fields, salt].join("|");
    return crypto.createHash("sha512").update(hashInput).digest("hex");
  }

  /**
   * Encode an object as application/x-www-form-urlencoded body.
   */
  private encodeFormData(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  /**
   * Process a refund via Easebuzz Refund API V1.
   *
   * POST {dashboardBaseUrl}/transaction/v1/refund
   * Hash sequence: key|txnid|amount|refund_amount|email|phone|salt
   *
   * @param params.paymentId - The original transaction ID (txnid)
   * @param params.amount - Refund amount in minor units or major units
   *   (the base interface uses number; we format to 2 decimal places)
   * @param params.metadata - Should contain: originalAmount, email, phone
   *   from the original transaction (required by Easebuzz)
   */
  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const baseUrl = this.getDashboardBaseUrl(credentials);
    const url = `${baseUrl}/transaction/v1/refund`;

    const txnid = params.paymentId;
    const refundAmount = params.amount.toFixed(2);

    // Easebuzz requires the original transaction amount, email, and phone.
    // These should be passed via params.metadata.
    const originalAmount =
      (params.metadata?.originalAmount as string) ?? refundAmount;
    const email =
      params.customerEmail ??
      (params.metadata?.email as string) ??
      "noreply@example.com";
    const phone =
      params.customerPhone ??
      (params.metadata?.phone as string) ??
      "9999999999";

    const formattedOriginalAmount = Number(originalAmount).toFixed(2);

    // Hash sequence: key|txnid|amount|refund_amount|email|phone|salt
    const hash = this.generateHash(
      [
        credentials.key,
        txnid,
        formattedOriginalAmount,
        refundAmount,
        email,
        phone,
      ],
      credentials.salt,
    );

    const formData: Record<string, string> = {
      key: credentials.key,
      txnid,
      amount: formattedOriginalAmount,
      refund_amount: refundAmount,
      email,
      phone,
      hash,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: this.encodeFormData(formData),
      });

      const data = (await response.json()) as EasebuzzRefundResponse;

      if (!response.ok || data.status === 0) {
        return {
          success: false,
          status: "failed",
          error:
            data.msg ??
            `Refund request failed (HTTP ${response.status})`,
          rawResponse: data,
        };
      }

      const refundStatus = this.mapRefundStatus(data.data?.status);

      return {
        success: true,
        refundId: data.data?.refund_id ?? txnid,
        status: refundStatus,
        amount: params.amount,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        status: "failed",
        error: `Easebuzz refund request error: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Get refund status by checking the transaction details.
   *
   * Easebuzz does not have a dedicated refund-status-by-refundId endpoint
   * in their V1 API. We use the Transaction Retrieve API to check the
   * refund_status field on the transaction.
   *
   * POST {dashboardBaseUrl}/transaction/v1/retrieve
   * Hash sequence: key|txnid|amount|email|phone|salt
   *
   * The refundId passed here is expected to be the original txnid.
   * Additional lookup params (amount, email, phone) should be passed
   * via the credentials map with keys prefixed "lookup_" if available,
   * or we fall back to placeholder values.
   *
   * TODO: If Easebuzz Refund Status API V2 becomes available in the
   * official library, switch to that for direct refund_id lookups.
   */
  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const baseUrl = this.getDashboardBaseUrl(credentials);
    const url = `${baseUrl}/transaction/v1/retrieve`;

    // The refundId here is the txnid of the original transaction.
    const txnid = refundId;

    // For the transaction retrieve API we need amount, email, phone.
    // These may be passed as lookup_ prefixed credentials or defaults.
    const amount = credentials.lookup_amount ?? "0.00";
    const email = credentials.lookup_email ?? "noreply@example.com";
    const phone = credentials.lookup_phone ?? "9999999999";

    // Hash sequence: key|txnid|amount|email|phone|salt
    const hash = this.generateHash(
      [credentials.key, txnid, amount, email, phone],
      credentials.salt,
    );

    const formData: Record<string, string> = {
      key: credentials.key,
      txnid,
      amount,
      email,
      phone,
      hash,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: this.encodeFormData(formData),
      });

      const data = (await response.json()) as EasebuzzTransactionResponse;

      if (!response.ok || data.status === 0) {
        return {
          success: false,
          status: "failed",
          error:
            data.msg ?? `Transaction retrieve failed (HTTP ${response.status})`,
          rawResponse: data,
        };
      }

      const refundStatus = this.mapRefundStatus(
        data.data?.refund_status ?? data.data?.status,
      );
      const refundAmount = data.data?.refund_amount
        ? parseFloat(data.data.refund_amount)
        : undefined;

      return {
        success: true,
        refundId: txnid,
        status: refundStatus,
        amount: refundAmount,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        status: "failed",
        error: `Easebuzz status check error: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Validate credentials by making a test transaction retrieve call.
   * We use a dummy txnid that won't match any real transaction;
   * if auth itself fails we get a different error than "txn not found".
   */
  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.key || !credentials.salt) {
      return { valid: false, error: "Key and Salt are required" };
    }

    if (!credentials.environment) {
      return { valid: false, error: "Environment is required" };
    }

    try {
      const baseUrl = this.getDashboardBaseUrl(credentials);
      const url = `${baseUrl}/transaction/v1/retrieve`;

      // Use a dummy transaction to test authentication.
      // If the key/salt are wrong, Easebuzz returns a hash mismatch error.
      // If they are correct but txnid doesn't exist, we get a "not found" response.
      const dummyTxnid = "VALIDATE_CREDS_TEST";
      const dummyAmount = "1.00";
      const dummyEmail = "test@test.com";
      const dummyPhone = "9999999999";

      const hash = this.generateHash(
        [credentials.key, dummyTxnid, dummyAmount, dummyEmail, dummyPhone],
        credentials.salt,
      );

      const formData: Record<string, string> = {
        key: credentials.key,
        txnid: dummyTxnid,
        amount: dummyAmount,
        email: dummyEmail,
        phone: dummyPhone,
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

      // If Easebuzz returns a hash/key error, credentials are invalid.
      // Common error messages for bad credentials: "Invalid merchant key",
      // "Hash validation failed", etc.
      const msg = ((data.msg as string) ?? "").toLowerCase();
      if (
        msg.includes("invalid") &&
        (msg.includes("key") || msg.includes("merchant"))
      ) {
        return { valid: false, error: "Invalid merchant key" };
      }
      if (msg.includes("hash")) {
        return {
          valid: false,
          error: "Hash validation failed -- check your salt",
        };
      }

      // If we get here, the key/salt are accepted (txn not found is fine).
      return { valid: true };
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
      error: "Easebuzz does not support store credit",
    });
  }

  /**
   * Map Easebuzz refund status strings to our RefundResult status.
   *
   * Known Easebuzz statuses:
   *   refund_queued, refund_initiated -> pending
   *   refunded -> processed
   *   refund_failed -> failed
   */
  private mapRefundStatus(
    ebStatus: string | undefined,
  ): RefundResult["status"] {
    if (!ebStatus) return "pending";

    const normalized = ebStatus.toLowerCase();
    if (normalized === "refunded" || normalized === "success") {
      return "processed";
    }
    if (
      normalized === "refund_failed" ||
      normalized === "failed" ||
      normalized === "failure"
    ) {
      return "failed";
    }
    // refund_queued, refund_initiated, pending, etc.
    return "pending";
  }
}
