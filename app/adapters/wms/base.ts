export interface WmsReturnParams {
  returnId: string;
  orderId: string;
  orderNumber: string;
  awb?: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    reason: string;
    condition?: "good" | "damaged" | "unsellable";
  }>;
  warehouse?: string;
  metadata?: Record<string, unknown>;
}

export interface WmsReturnResult {
  success: boolean;
  wmsReturnId?: string;
  status?: string;
  rawResponse?: unknown;
  error?: string;
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

export abstract class WmsAdapter {
  abstract readonly key: string;
  abstract readonly displayName: string;
  abstract readonly logoUrl: string;
  abstract readonly credentialFields: CredentialField[];

  abstract syncReturnToWms(params: WmsReturnParams, credentials: Record<string, string>): Promise<WmsReturnResult>;
  abstract validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }>;
  abstract getReturnStatus(wmsReturnId: string, credentials: Record<string, string>): Promise<WmsReturnResult>;
}
