import type { WmsAdapter, CredentialField } from "./base";

export interface WmsAdapterEntry {
  key: string;
  displayName: string;
  logoUrl: string;
  credentialFields: CredentialField[];
  adapter: WmsAdapter;
}

class WmsAdapterRegistry {
  private adapters = new Map<string, WmsAdapterEntry>();

  register(adapter: WmsAdapter): void {
    this.adapters.set(adapter.key, {
      key: adapter.key,
      displayName: adapter.displayName,
      logoUrl: adapter.logoUrl,
      credentialFields: adapter.credentialFields,
      adapter,
    });
  }

  get(key: string): WmsAdapterEntry | undefined {
    return this.adapters.get(key);
  }

  getAdapter(key: string): WmsAdapter | undefined {
    return this.adapters.get(key)?.adapter;
  }

  list(): WmsAdapterEntry[] {
    return Array.from(this.adapters.values());
  }
}

export const wmsRegistry = new WmsAdapterRegistry();
