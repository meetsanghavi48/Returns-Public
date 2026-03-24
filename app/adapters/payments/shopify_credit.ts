import {
  PaymentAdapter,
  type RefundParams,
  type RefundResult,
  type StoreCreditParams,
  type StoreCreditResult,
  type CredentialField,
} from "./base";

export class ShopifyCreditAdapter extends PaymentAdapter {
  readonly key = "shopify_credit";
  readonly displayName = "Shopify Store Credit";
  readonly logoUrl = "/images/payment-logos/shopify_credit.svg";
  readonly supportsRefund = false;
  readonly supportsStoreCredit = true;

  readonly credentialFields: CredentialField[] = [
    {
      key: "shopDomain",
      label: "Shop Domain",
      type: "text",
      required: true,
      placeholder: "your-store.myshopify.com",
      helpText: "Your Shopify store domain (e.g., your-store.myshopify.com)",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      placeholder: "shpat_...",
      helpText: "Admin API access token with gift card permissions",
    },
  ];

  private getBaseUrl(credentials: Record<string, string>): string {
    const domain = credentials.shopDomain.replace(/\/$/, "");
    return `https://${domain}/admin/api/2024-01`;
  }

  private getHeaders(credentials: Record<string, string>): Record<string, string> {
    return {
      "X-Shopify-Access-Token": credentials.accessToken,
      "Content-Type": "application/json",
    };
  }

  async processRefund(
    _params: RefundParams,
    _credentials: Record<string, string>,
  ): Promise<RefundResult> {
    return {
      success: false,
      status: "failed",
      error: "Shopify Store Credit does not support direct refunds. Use issueStoreCredit instead.",
    };
  }

  async getRefundStatus(
    _refundId: string,
    _credentials: Record<string, string>,
  ): Promise<RefundResult> {
    return {
      success: false,
      status: "failed",
      error: "Shopify Store Credit does not support refund status tracking",
    };
  }

  async issueStoreCredit(
    params: StoreCreditParams,
    credentials: Record<string, string>,
  ): Promise<StoreCreditResult> {
    const url = `${this.getBaseUrl(credentials)}/gift_cards.json`;

    const body = {
      gift_card: {
        initial_value: String(params.amount),
        currency: params.currency,
        note: params.note ?? `Store credit for order ${params.orderId}`,
        template_suffix: null,
        customer_id: undefined as string | undefined,
      },
    };

    // If we have a customer email, we don't set customer_id here —
    // Shopify gift cards are looked up by code, not customer
    delete body.gift_card.customer_id;

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(credentials),
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errors = data.errors as string | Record<string, unknown> | undefined;
      const errorMessage =
        typeof errors === "string"
          ? errors
          : errors
            ? JSON.stringify(errors)
            : "Failed to create gift card";
      return {
        success: false,
        error: errorMessage,
      };
    }

    const giftCard = data.gift_card as Record<string, unknown>;

    return {
      success: true,
      creditId: String(giftCard.id),
      code: giftCard.code as string,
      amount: Number(giftCard.initial_value),
    };
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.shopDomain || !credentials.accessToken) {
      return {
        valid: false,
        error: "Shop Domain and Access Token are required",
      };
    }

    try {
      const url = `${this.getBaseUrl(credentials)}/shop.json`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(credentials),
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
}
