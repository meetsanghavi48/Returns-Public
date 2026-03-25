export interface RefundParams {
  paymentId: string; // original payment/transaction ID
  amount: number;
  currency: string;
  reason?: string;
  orderId: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  status: "processed" | "pending" | "failed";
  amount?: number;
  rawResponse?: unknown;
  error?: string;
}

export interface StoreCreditParams {
  amount: number;
  currency: string;
  customerEmail: string;
  orderId: string;
  note?: string;
}

export interface StoreCreditResult {
  success: boolean;
  creditId?: string;
  code?: string; // gift card code if applicable
  amount?: number;
  error?: string;
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

export abstract class PaymentAdapter {
  abstract readonly key: string;
  abstract readonly displayName: string;
  abstract readonly logoUrl: string;
  abstract readonly credentialFields: CredentialField[];
  abstract readonly supportsRefund: boolean;
  abstract readonly supportsStoreCredit: boolean;
  readonly setupNote?: string;
  readonly setupGuideUrl?: string;
  readonly contactEmail?: string;
  readonly isPartnerApp?: boolean;
  readonly integrationTypes?: string[];

  abstract processRefund(params: RefundParams, credentials: Record<string, string>): Promise<RefundResult>;
  abstract issueStoreCredit?(params: StoreCreditParams, credentials: Record<string, string>): Promise<StoreCreditResult>;
  abstract validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }>;
  abstract getRefundStatus(refundId: string, credentials: Record<string, string>): Promise<RefundResult>;
}
