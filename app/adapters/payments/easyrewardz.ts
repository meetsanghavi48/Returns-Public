import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class EasyrewardzAdapter extends PaymentAdapter {
  readonly key = "easyrewardz";
  readonly displayName = "EasyRewardz";
  readonly logoUrl = "/images/payment-logos/easyrewardz.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your EasyRewardz API Key",
    },
    {
      key: "merchantId",
      label: "Merchant ID",
      type: "text",
      required: true,
      placeholder: "Enter your EasyRewardz Merchant ID",
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
