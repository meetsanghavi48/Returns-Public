import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class ShopfloAdapter extends PaymentAdapter {
  readonly key = "shopflo";
  readonly displayName = "Shopflo";
  readonly logoUrl = "/images/payment-logos/shopflo.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your Shopflo API Key",
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
