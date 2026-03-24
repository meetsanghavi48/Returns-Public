import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class GyftrAdapter extends PaymentAdapter {
  readonly key = "gyftr";
  readonly displayName = "GyFTR";
  readonly logoUrl = "/images/payment-logos/gyftr.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;

  readonly credentialFields: CredentialField[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "Enter your GyFTR API Key",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      placeholder: "Enter your GyFTR Access Token",
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
