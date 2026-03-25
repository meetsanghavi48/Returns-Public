import type { LogisticsAdapter, CredentialField, AdapterMeta } from "./base";

export interface AdapterEntry {
  key: string;
  displayName: string;
  region: string;
  logoUrl: string;
  credentialFields: CredentialField[];
  meta: AdapterMeta;
  adapter: LogisticsAdapter;
}

class LogisticsAdapterRegistry {
  private adapters = new Map<string, AdapterEntry>();

  register(adapter: LogisticsAdapter): void {
    this.adapters.set(adapter.key, {
      key: adapter.key,
      displayName: adapter.displayName,
      region: adapter.region,
      logoUrl: adapter.logoUrl,
      credentialFields: adapter.credentialFields,
      meta: adapter.meta,
      adapter,
    });
  }

  get(key: string): AdapterEntry | undefined {
    return this.adapters.get(key);
  }

  getAdapter(key: string): LogisticsAdapter | undefined {
    return this.adapters.get(key)?.adapter;
  }

  list(): AdapterEntry[] {
    return Array.from(this.adapters.values());
  }

  listByRegion(region: string): AdapterEntry[] {
    return this.list().filter(
      (a) => a.region === region || a.region === "global"
    );
  }
}

export const logisticsRegistry = new LogisticsAdapterRegistry();
