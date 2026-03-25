import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";

import "~/adapters/logistics/index";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { requireAdminAuth } from "~/services/admin-session.server";
import prisma from "~/db.server";
import { encrypt } from "~/utils/encryption.server";

interface CredentialFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select" | "number" | "multiselect";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

interface AdapterMeta {
  qcSupport?: boolean;
  contactEmail?: string;
  setupGuideUrl?: string;
}

interface AdapterInfo {
  key: string;
  displayName: string;
  region: string;
  credentialFields: CredentialFieldDef[];
  meta: AdapterMeta;
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);

  const configs = await prisma.logisticsConfig.findMany({
    where: { shop, isActive: true },
    select: { providerKey: true, displayName: true, isDefault: true, isActive: true },
  });

  const available: AdapterInfo[] = logisticsRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    region: a.region,
    credentialFields: a.credentialFields,
    meta: a.meta,
  }));

  return json({ available, connected: configs as ConnectedConfig[] });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const providerKey = formData.get("providerKey") as string;

  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const displayName = formData.get("displayName") as string;
    const isDefault = formData.get("isDefault") === "true";
    const region = (formData.get("region") as string) || "global";

    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }

    try {
      const entry = logisticsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown logistics provider." });
      const result = await entry.adapter.validateCredentials(credentials);
      if (!result.valid) return json({ success: false, message: result.error || "Credential validation failed." });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Credential validation failed." });
    }

    const encryptedCredentials = encrypt(credentialsRaw);
    if (isDefault) {
      await prisma.logisticsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
    }
    await prisma.logisticsConfig.upsert({
      where: { shop_providerKey: { shop, providerKey } },
      update: { credentials: encryptedCredentials, displayName, isDefault, isActive: true, region },
      create: { shop, providerKey, credentials: encryptedCredentials, displayName, isDefault, isActive: true, region },
    });
    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    await prisma.logisticsConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    return json({ success: true, message: "Provider disconnected." });
  }

  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;
    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }
    try {
      const entry = logisticsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown logistics provider." });
      const result = await entry.adapter.validateCredentials(credentials);
      return json({ success: result.valid, message: result.valid ? "Credentials validated successfully." : (result.error || "Validation failed.") });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Connection test failed." });
    }
  }

  if (intent === "set_default") {
    await prisma.logisticsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
    await prisma.logisticsConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

export default function AdminLogistics() {
  const { available, connected } = useLoaderData<typeof loader>();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [modalAdapter, setModalAdapter] = useState<AdapterInfo | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const connectFetcher = useFetcher<{ success: boolean; message: string }>();
  const testFetcher = useFetcher<{ success: boolean; message: string }>();
  const disconnectFetcher = useFetcher<{ success: boolean; message: string }>();
  const defaultFetcher = useFetcher<{ success: boolean; message: string }>();

  const connectedMap = new Map((connected as ConnectedConfig[]).map((c) => [c.providerKey, c]));

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  const openModal = useCallback((adapter: AdapterInfo) => {
    setModalAdapter(adapter); setCredValues({}); setSetAsDefault(false); setFeedback(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalAdapter(null); setCredValues({}); setFeedback(null);
  }, []);

  useEffect(() => {
    if (connectFetcher.data) {
      if (connectFetcher.data.success) { setToast({ message: connectFetcher.data.message, type: "success" }); closeModal(); }
      else setFeedback({ type: "error", message: connectFetcher.data.message });
    }
  }, [connectFetcher.data, closeModal]);

  useEffect(() => {
    if (testFetcher.data) setFeedback({ type: testFetcher.data.success ? "success" : "error", message: testFetcher.data.message });
  }, [testFetcher.data]);

  useEffect(() => {
    if (disconnectFetcher.data) setToast({ message: disconnectFetcher.data.message, type: disconnectFetcher.data.success ? "success" : "error" });
  }, [disconnectFetcher.data]);

  useEffect(() => {
    if (defaultFetcher.data) setToast({ message: defaultFetcher.data.message, type: defaultFetcher.data.success ? "success" : "error" });
  }, [defaultFetcher.data]);

  const handleConnect = useCallback(() => {
    if (!modalAdapter) return;
    for (const field of modalAdapter.credentialFields) {
      if (field.required && !credValues[field.key]?.trim()) {
        setFeedback({ type: "error", message: `${field.label} is required.` }); return;
      }
    }
    const fd = new FormData();
    fd.set("intent", "connect"); fd.set("providerKey", modalAdapter.key);
    fd.set("displayName", modalAdapter.displayName);
    fd.set("credentials", JSON.stringify(credValues));
    fd.set("isDefault", String(setAsDefault));
    fd.set("region", modalAdapter.region || "global");
    connectFetcher.submit(fd, { method: "post" });
  }, [modalAdapter, credValues, setAsDefault, connectFetcher]);

  const handleTest = useCallback(() => {
    if (!modalAdapter) return;
    const fd = new FormData();
    fd.set("intent", "test"); fd.set("providerKey", modalAdapter.key);
    fd.set("credentials", JSON.stringify(credValues));
    testFetcher.submit(fd, { method: "post" });
  }, [modalAdapter, credValues, testFetcher]);

  const handleDisconnect = useCallback((key: string) => {
    const fd = new FormData(); fd.set("intent", "disconnect"); fd.set("providerKey", key);
    disconnectFetcher.submit(fd, { method: "post" });
  }, [disconnectFetcher]);

  const handleSetDefault = useCallback((key: string) => {
    const fd = new FormData(); fd.set("intent", "set_default"); fd.set("providerKey", key);
    defaultFetcher.submit(fd, { method: "post" });
  }, [defaultFetcher]);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <a href="/admin/settings" className="admin-back">&lsaquo; Settings</a>
          <h1 className="admin-page-title">Logistics</h1>
          <p style={{ color: "var(--admin-text-muted)", fontSize: 14, marginTop: 4 }}>
            Manage your logistics provider integrations ({(available as AdapterInfo[]).length} providers available)
          </p>
        </div>
      </div>

      {toast && (
        <div className={`admin-banner ${toast.type === "error" ? "error" : "success"}`}>{toast.message}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {(available as AdapterInfo[]).map((adapter) => {
          const config = connectedMap.get(adapter.key);
          const isConnected = !!config;
          const isDefault = config?.isDefault ?? false;

          return (
            <div key={adapter.key} className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: `hsl(${adapter.displayName.charCodeAt(0) * 7 % 360}, 55%, 50%)`,
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {adapter.displayName.charAt(0).toUpperCase()}
                  </div>
                  <strong style={{ fontSize: 15 }}>{adapter.displayName}</strong>
                </div>
                <span className={`admin-badge ${isConnected ? "delivered" : "archived"}`}>
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              </div>

              <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Region: {adapter.region}</span>

              {isConnected && isDefault && <span className="admin-badge info">Default</span>}

              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <button className="admin-btn admin-btn-sm" onClick={() => openModal(adapter)}>
                  {isConnected ? "Manage" : "Connect"}
                </button>
                {isConnected && !isDefault && (
                  <button className="admin-btn admin-btn-sm" onClick={() => handleSetDefault(adapter.key)}>Set Default</button>
                )}
                {isConnected && (
                  <button className="admin-btn admin-btn-sm" style={{ color: "var(--admin-danger)" }} onClick={() => handleDisconnect(adapter.key)}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Modal */}
      {modalAdapter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Connect {modalAdapter.displayName}</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--admin-text-muted)" }}>&times;</button>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {modalAdapter.meta?.setupGuideUrl && (
                <div className="admin-banner info">
                  Need help? <a href={modalAdapter.meta.setupGuideUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--admin-accent)" }}>Click here for setup guide</a>
                </div>
              )}

              {feedback && (
                <div className={`admin-banner ${feedback.type === "success" ? "success" : "error"}`}>{feedback.message}</div>
              )}

              {modalAdapter.credentialFields.map((field) => (
                <div key={field.key} className="admin-form-group">
                  <label className="admin-label">
                    {field.label} {field.required && <span style={{ color: "var(--admin-danger)" }}>*</span>}
                  </label>
                  {field.type === "select" && field.options ? (
                    <select className="admin-select" value={credValues[field.key] || ""} onChange={(e) => setCredValues((p) => ({ ...p, [field.key]: e.target.value }))}>
                      <option value="">Select...</option>
                      {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : field.type === "multiselect" && field.options ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      {field.options.map((o) => {
                        const selected = (credValues[field.key] || "").split(",").filter(Boolean);
                        const isChecked = selected.includes(o.value);
                        return (
                          <label key={o.value} className="admin-checkbox-row" style={{ fontSize: 13 }}>
                            <input type="checkbox" checked={isChecked} onChange={() => {
                              const next = isChecked ? selected.filter((v) => v !== o.value) : [...selected, o.value];
                              setCredValues((p) => ({ ...p, [field.key]: next.join(",") }));
                            }} />
                            {o.label}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      className="admin-input"
                      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                      value={credValues[field.key] || ""}
                      onChange={(e) => setCredValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete="off"
                    />
                  )}
                  {field.helpText && <p className="admin-help">{field.helpText}</p>}
                </div>
              ))}

              <label className="toggle-switch">
                <input type="checkbox" checked={setAsDefault} onChange={(e) => setSetAsDefault(e.target.checked)} />
                <span className="toggle-slider" />
                <span className="toggle-label">Set as default provider</span>
              </label>
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--admin-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="admin-btn admin-btn-sm" onClick={handleTest} disabled={testFetcher.state !== "idle"}>
                {testFetcher.state !== "idle" ? "Testing..." : "Test Connection"}
              </button>
              <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={handleConnect} disabled={connectFetcher.state !== "idle"}>
                {connectFetcher.state !== "idle" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
