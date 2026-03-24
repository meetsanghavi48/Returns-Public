import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

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
    },
    {
      key: "salt",
      label: "Salt",
      type: "password",
      required: true,
      placeholder: "Enter your Easebuzz Salt",
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
