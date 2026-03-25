import type { PaymentAdapter, CredentialField } from "./base";

export interface PaymentAdapterEntry {
  key: string;
  displayName: string;
  logoUrl: string;
  credentialFields: CredentialField[];
  supportsRefund: boolean;
  supportsStoreCredit: boolean;
  adapter: PaymentAdapter;
  setupNote?: string;
  setupGuideUrl?: string;
  contactEmail?: string;
  isPartnerApp?: boolean;
  integrationTypes?: string[];
}

class PaymentAdapterRegistry {
  private adapters = new Map<string, PaymentAdapterEntry>();

  register(adapter: PaymentAdapter): void {
    this.adapters.set(adapter.key, {
      key: adapter.key,
      displayName: adapter.displayName,
      logoUrl: adapter.logoUrl,
      credentialFields: adapter.credentialFields,
      supportsRefund: adapter.supportsRefund,
      supportsStoreCredit: adapter.supportsStoreCredit,
      adapter,
      setupNote: adapter.setupNote,
      setupGuideUrl: adapter.setupGuideUrl,
      contactEmail: adapter.contactEmail,
      isPartnerApp: adapter.isPartnerApp,
      integrationTypes: adapter.integrationTypes,
    });
  }

  get(key: string): PaymentAdapterEntry | undefined {
    return this.adapters.get(key);
  }

  getAdapter(key: string): PaymentAdapter | undefined {
    return this.adapters.get(key)?.adapter;
  }

  list(): PaymentAdapterEntry[] {
    return Array.from(this.adapters.values());
  }
}

export const paymentRegistry = new PaymentAdapterRegistry();
