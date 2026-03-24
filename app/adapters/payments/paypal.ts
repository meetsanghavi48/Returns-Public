import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class PaypalAdapter extends PaymentAdapter {
  readonly key = "paypal";
  readonly displayName = "PayPal";
  readonly logoUrl = "/images/payment-logos/paypal.svg";
  readonly supportsRefund = true;
  readonly supportsStoreCredit = false;

  readonly credentialFields: CredentialField[] = [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "Enter your PayPal Client ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "Enter your PayPal Client Secret",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Sandbox", value: "sandbox" },
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
