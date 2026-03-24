import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

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
      placeholder: "Enter your Razorpay X Key ID",
    },
    {
      key: "keySecret",
      label: "Key Secret",
      type: "password",
      required: true,
      placeholder: "Enter your Razorpay X Key Secret",
    },
    {
      key: "accountNumber",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your Razorpay X Account Number",
    },
  ];

  processRefund(
    _params: RefundParams,
    _credentials: Record<string, string>,
  ): Promise<RefundResult> {
    throw new Error("Not implemented");
  }

  getRefundStatus(
    _refundId: string,
    _credentials: Record<string, string>,
  ): Promise<RefundResult> {
    throw new Error("Not implemented");
  }

  validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented");
  }

  issueStoreCredit(
    _params: StoreCreditParams,
    _credentials: Record<string, string>,
  ): Promise<StoreCreditResult> {
    throw new Error("Not implemented");
  }
}
