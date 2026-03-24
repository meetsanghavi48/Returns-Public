import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class TapAdapter extends PaymentAdapter {
  readonly key = "tap";
  readonly displayName = "Tap (MENA)";
  readonly logoUrl = "/images/payment-logos/tap.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Enter your Tap Secret Key",
      helpText: "MENA region payment gateway",
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
