import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class KlarnaAdapter extends PaymentAdapter {
  readonly key = "klarna";
  readonly displayName = "Klarna";
  readonly logoUrl = "/images/payment-logos/klarna.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your Klarna API Username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your Klarna API Password",
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      required: true,
      options: [
        { label: "Europe", value: "EU" },
        { label: "North America", value: "NA" },
        { label: "Oceania", value: "OC" },
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
