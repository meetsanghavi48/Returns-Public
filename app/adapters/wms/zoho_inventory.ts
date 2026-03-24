import {
  WmsAdapter,
  type WmsReturnParams,
  type WmsReturnResult,
  type CredentialField,
} from "./base";

interface ZohoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ZohoSalesReturnResponse {
  code: number;
  message: string;
  salesreturn?: {
    salesreturn_id: string;
    salesreturn_number: string;
    status: string;
  };
}

export class ZohoInventoryAdapter extends WmsAdapter {
  readonly key = "zoho_inventory";
  readonly displayName = "Zoho Inventory";
  readonly logoUrl = "/integrations/zoho-inventory.svg";
  readonly credentialFields: CredentialField[] = [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "OAuth2 Client ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "OAuth2 Client Secret",
    },
    {
      key: "refreshToken",
      label: "Refresh Token",
      type: "password",
      required: true,
      placeholder: "OAuth2 Refresh Token",
      helpText: "Generate from the Zoho API Console",
    },
    {
      key: "organizationId",
      label: "Organization ID",
      type: "text",
      required: true,
      placeholder: "Your Zoho organization ID",
    },
  ];

  private static readonly BASE_URL = "https://inventory.zoho.com/api/v1";
  private static readonly TOKEN_URL =
    "https://accounts.zoho.com/oauth/v2/token";

  private async getAccessToken(
    credentials: Record<string, string>,
  ): Promise<string> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    });

    const response = await fetch(ZohoInventoryAdapter.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Zoho token refresh failed with status ${response.status}`);
    }

    const data = (await response.json()) as ZohoTokenResponse;
    if (!data.access_token) {
      throw new Error("Zoho token refresh did not return an access token");
    }

    return data.access_token;
  }

  async syncReturnToWms(
    params: WmsReturnParams,
    credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    try {
      const accessToken = await this.getAccessToken(credentials);

      const lineItems = params.items.map((item) => ({
        item_id: item.sku,
        name: item.title,
        quantity: item.quantity,
        reason: item.reason,
      }));

      const response = await fetch(
        `${ZohoInventoryAdapter.BASE_URL}/salesreturns?organization_id=${credentials.organizationId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
          body: JSON.stringify({
            salesorder_number: params.orderNumber,
            reason: params.items[0]?.reason ?? "Customer return",
            line_items: lineItems,
          }),
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Zoho Inventory API returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as ZohoSalesReturnResponse;
      const isSuccess = data.code === 0;

      return {
        success: isSuccess,
        wmsReturnId: data.salesreturn?.salesreturn_id,
        status: data.salesreturn?.status ?? (isSuccess ? "created" : "failed"),
        rawResponse: data,
        error: isSuccess ? undefined : data.message,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Unknown Zoho Inventory error",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken(credentials);

      const response = await fetch(
        `${ZohoInventoryAdapter.BASE_URL}/organizations?organization_id=${credentials.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        return {
          valid: false,
          error: `Zoho API returned status ${response.status}`,
        };
      }

      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to validate Zoho credentials",
      };
    }
  }

  async getReturnStatus(
    wmsReturnId: string,
    credentials: Record<string, string>,
  ): Promise<WmsReturnResult> {
    try {
      const accessToken = await this.getAccessToken(credentials);

      const response = await fetch(
        `${ZohoInventoryAdapter.BASE_URL}/salesreturns/${wmsReturnId}?organization_id=${credentials.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Zoho API returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as ZohoSalesReturnResponse;
      return {
        success: data.code === 0,
        wmsReturnId,
        status: data.salesreturn?.status ?? "unknown",
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Unknown Zoho Inventory error",
      };
    }
  }
}
