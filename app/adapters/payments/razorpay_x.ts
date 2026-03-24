import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

// --- RazorpayX API response types ---

interface RazorpayXError {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
  };
}

interface RazorpayXContact {
  id: string;
  entity: string;
  name: string;
  contact: string | null;
  email: string | null;
  type: string | null;
  reference_id: string | null;
  active: boolean;
}

interface RazorpayXBankAccount {
  ifsc: string;
  bank_name: string;
  name: string;
  account_number: string;
}

interface RazorpayXVpa {
  username: string;
  handle: string;
  address: string;
}

interface RazorpayXFundAccount {
  id: string;
  entity: string;
  contact_id: string;
  account_type: "bank_account" | "vpa";
  bank_account?: RazorpayXBankAccount;
  vpa?: RazorpayXVpa;
  active: boolean;
}

type PayoutStatus =
  | "queued"
  | "pending"
  | "processing"
  | "processed"
  | "reversed"
  | "cancelled"
  | "rejected";

type PayoutMode = "NEFT" | "RTGS" | "IMPS" | "UPI";

interface RazorpayXPayout {
  id: string;
  entity: string;
  fund_account_id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  mode: PayoutMode;
  purpose: string;
  utr: string | null;
  reference_id: string | null;
  failure_reason: string | null;
  created_at: number;
}

// --- Helper to determine refund result status from payout status ---

function mapPayoutStatus(
  status: PayoutStatus,
): RefundResult["status"] {
  switch (status) {
    case "processed":
      return "processed";
    case "reversed":
    case "cancelled":
    case "rejected":
      return "failed";
    default:
      // queued, pending, processing
      return "pending";
  }
}

// --- Adapter ---

export class RazorpayXAdapter extends PaymentAdapter {
  readonly key = "razorpay_x";
  readonly displayName = "Razorpay X";
  readonly logoUrl = "/images/payment-logos/razorpay_x.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "keyId",
      label: "Key ID",
      type: "text",
      required: true,
      placeholder: "rzp_live_...",
      helpText: "Your RazorpayX Key ID from the Dashboard",
    },
    {
      key: "keySecret",
      label: "Key Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Key Secret",
      helpText: "Your RazorpayX Key Secret from the Dashboard",
    },
    {
      key: "accountNumber",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your RazorpayX Account Number",
      helpText:
        "The account number of your RazorpayX current account (virtual or physical)",
    },
  ];

  private getBaseUrl(): string {
    return "https://api.razorpay.com/v1";
  }

  private getAuthHeader(credentials: Record<string, string>): string {
    const encoded = btoa(`${credentials.keyId}:${credentials.keySecret}`);
    return `Basic ${encoded}`;
  }

  /**
   * Extracts error description from a RazorpayX error response body.
   */
  private extractError(data: unknown): string {
    const err = data as RazorpayXError | undefined;
    return err?.error?.description ?? "Unknown RazorpayX error";
  }

  // ---- Step 1: Create Contact ----

  private async createContact(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RazorpayXContact> {
    const url = `${this.getBaseUrl()}/contacts`;

    const body: Record<string, unknown> = {
      name: params.customerEmail ?? `Customer-${params.orderId}`,
      type: "customer",
      reference_id: params.orderId,
    };
    if (params.customerEmail) body.email = params.customerEmail;
    if (params.customerPhone) body.contact = params.customerPhone;
    if (params.metadata?.notes) body.notes = params.metadata.notes;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(`Create contact failed: ${this.extractError(data)}`);
    }

    return data as RazorpayXContact;
  }

  // ---- Step 2: Create Fund Account ----

  private async createFundAccount(
    contactId: string,
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RazorpayXFundAccount> {
    const url = `${this.getBaseUrl()}/fund_accounts`;

    const meta = params.metadata ?? {};

    // Determine account type from metadata
    const isUpi = meta.vpa != null;
    const body: Record<string, unknown> = {
      contact_id: contactId,
      account_type: isUpi ? "vpa" : "bank_account",
    };

    if (isUpi) {
      body.vpa = {
        address: meta.vpa as string,
      };
    } else {
      body.bank_account = {
        name: (meta.accountHolderName as string) ?? `Customer-${params.orderId}`,
        ifsc: meta.ifsc as string,
        account_number: meta.accountNumber as string,
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(
        `Create fund account failed: ${this.extractError(data)}`,
      );
    }

    return data as RazorpayXFundAccount;
  }

  // ---- Step 3: Create Payout ----

  private async createPayout(
    fundAccountId: string,
    params: RefundParams,
    credentials: Record<string, string>,
    mode: PayoutMode,
  ): Promise<RazorpayXPayout> {
    const url = `${this.getBaseUrl()}/payouts`;

    const body: Record<string, unknown> = {
      account_number: credentials.accountNumber,
      fund_account_id: fundAccountId,
      amount: params.amount,
      currency: params.currency || "INR",
      mode,
      purpose: "refund",
      queue_if_low_balance: true,
      reference_id: params.orderId,
      narration: params.reason ?? `Refund for order ${params.orderId}`,
    };

    if (params.metadata?.notes) {
      body.notes = params.metadata.notes;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(`Create payout failed: ${this.extractError(data)}`);
    }

    return data as RazorpayXPayout;
  }

  // ---- Public methods ----

  async processRefund(
    params: RefundParams,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    try {
      // Step 1: Create a contact for the customer
      const contact = await this.createContact(params, credentials);

      // Step 2: Create a fund account linked to that contact
      const fundAccount = await this.createFundAccount(
        contact.id,
        params,
        credentials,
      );

      // Step 3: Determine payout mode
      const isUpi = params.metadata?.vpa != null;
      const mode: PayoutMode = isUpi
        ? "UPI"
        : (params.metadata?.payoutMode as PayoutMode | undefined) ?? "IMPS";

      // Step 4: Create the payout
      const payout = await this.createPayout(
        fundAccount.id,
        params,
        credentials,
        mode,
      );

      return {
        success: true,
        refundId: payout.id,
        status: mapPayoutStatus(payout.status),
        amount: payout.amount,
        rawResponse: payout,
      };
    } catch (err) {
      return {
        success: false,
        status: "failed",
        error: (err as Error).message,
      };
    }
  }

  async getRefundStatus(
    refundId: string,
    credentials: Record<string, string>,
  ): Promise<RefundResult> {
    const url = `${this.getBaseUrl()}/payouts/${refundId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(credentials),
        },
      });

      const data = (await response.json()) as unknown;

      if (!response.ok) {
        return {
          success: false,
          status: "failed",
          error: this.extractError(data),
          rawResponse: data,
        };
      }

      const payout = data as RazorpayXPayout;

      return {
        success: true,
        refundId: payout.id,
        status: mapPayoutStatus(payout.status),
        amount: payout.amount,
        rawResponse: payout,
      };
    } catch (err) {
      return {
        success: false,
        status: "failed",
        error: `Connection error: ${(err as Error).message}`,
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.keyId || !credentials.keySecret || !credentials.accountNumber) {
      return {
        valid: false,
        error: "Key ID, Key Secret, and Account Number are required",
      };
    }

    try {
      // Fetch contacts with count=1 to verify credentials work
      const url = `${this.getBaseUrl()}/contacts?count=1`;
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
      error: "RazorpayX does not support store credit",
    });
  }
}
