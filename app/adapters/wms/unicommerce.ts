import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

interface UnicommerceAuthResponse {
  successful: boolean;
  accessToken: string;
  expiresIn: number;
}

interface UnicommerceReturnResponse {
  successful: boolean;
  reversePickupCode?: string;
  message?: string;
}

export class UnicommerceAdapter extends WmsAdapter {
  readonly key = "unicommerce";
  readonly displayName = "Unicommerce";
  readonly logoUrl = "/integrations/unicommerce.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Your Unicommerce username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Your Unicommerce password",
    },
    {
      key: "tenantId",
      label: "Tenant ID",
      type: "text",
      required: true,
      placeholder: "your-tenant",
      helpText: "The subdomain used in your Unicommerce URL (e.g. 'acme' for acme.unicommerce.com)",
    },
  ];

  private getBaseUrl(credentials: Record<string, string>): string {
    return `https://${credentials.tenantId}.unicommerce.com/services/rest/v1`;
  }

  private async authenticate(
    credentials: Record<string, string>,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(credentials);
    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Unicommerce auth failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as UnicommerceAuthResponse;
    if (!data.successful || !data.accessToken) {
      throw new Error("Unicommerce authentication unsuccessful");
    }

    return data.accessToken;
  }

  async syncReturnToWms(
    params: WmsReturnParams,
    credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    try {
      const token = await this.authenticate(credentials);
      const baseUrl = this.getBaseUrl(credentials);

      const response = await fetch(`${baseUrl}/returns/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          saleOrderCode: params.orderNumber,
          returnReason: params.items[0]?.reason ?? "Customer return",
          items: params.items.map((item) => ({
            itemSku: item.sku,
            qtyToReturn: item.quantity,
            returnReason: item.reason,
          })),
          reversePickupAwb: params.awb,
          facilityCode: params.warehouse,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Unicommerce API returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as UnicommerceReturnResponse;
      return {
        success: data.successful,
        wmsReturnId: data.reversePickupCode,
        status: data.successful ? "created" : "failed",
        rawResponse: data,
        error: data.successful ? undefined : data.message,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Unknown Unicommerce error",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.authenticate(credentials);
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to validate Unicommerce credentials",
      };
    }
  }

  async getReturnStatus(
    wmsReturnId: string,
    credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    try {
      const token = await this.authenticate(credentials);
      const baseUrl = this.getBaseUrl(credentials);

      const response = await fetch(`${baseUrl}/returns/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reversePickupCode: wmsReturnId }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Unicommerce API returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        success: true,
        wmsReturnId,
        status: (data.status as string) ?? "unknown",
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Unknown Unicommerce error",
      };
    }
  }
}
