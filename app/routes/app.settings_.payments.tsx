import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";

import "../adapters/payments/index";
import { paymentRegistry } from "../adapters/payments/registry";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { encrypt } from "../utils/encryption.server";

interface CredentialFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

interface AdapterInfo {
  key: string;
  displayName: string;
  credentialFields: CredentialFieldDef[];
  supportsRefund: boolean;
  supportsStoreCredit: boolean;
  setupNote?: string;
  setupGuideUrl?: string;
  contactEmail?: string;
  isPartnerApp?: boolean;
  integrationTypes?: string[];
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);

  const paymentConfigs = await prisma.paymentConfig.findMany({
    where: { shop, isActive: true },
    select: { providerKey: true, displayName: true, isDefault: true, isActive: true },
  });

  const available: AdapterInfo[] = paymentRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    credentialFields: a.credentialFields,
    supportsRefund: a.supportsRefund,
    supportsStoreCredit: a.supportsStoreCredit,
    setupNote: a.setupNote,
    setupGuideUrl: a.setupGuideUrl,
    contactEmail: a.contactEmail,
    isPartnerApp: a.isPartnerApp,
    integrationTypes: a.integrationTypes,
  }));

  return json({ available, connected: paymentConfigs as ConnectedConfig[] });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const providerKey = formData.get("providerKey") as string;

  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const displayName = formData.get("displayName") as string;
    const isDefault = formData.get("isDefault") === "true";

    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch { return json({ success: false, message: "Invalid credentials format." }); }

    try {
      const entry = paymentRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown payment provider." });
      const validationResult = await entry.adapter.validateCredentials(credentials);
      if (!validationResult.valid) return json({ success: false, message: validationResult.error || "Credential validation failed." });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Credential validation failed." });
    }

    const encryptedCredentials = encrypt(credentialsRaw);
    if (isDefault) await prisma.paymentConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });

    await prisma.paymentConfig.upsert({
      where: { shop_providerKey: { shop, providerKey } },
      update: { credentials: encryptedCredentials, displayName, isDefault, isActive: true },
      create: { shop, providerKey, displayName, credentials: encryptedCredentials, isDefault, isActive: true },
    });

    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    await prisma.paymentConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    return json({ success: true, message: "Provider disconnected." });
  }

  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;
    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch { return json({ success: false, message: "Invalid credentials format." }); }
    try {
      const entry = paymentRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown payment provider." });
      const result = await entry.adapter.validateCredentials(credentials);
      return json({ success: result.valid, message: result.valid ? "Credentials validated successfully." : (result.error || "Validation failed.") });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Connection test failed." });
    }
  }

  if (intent === "set_default") {
    await prisma.paymentConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
    await prisma.paymentConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

export default function SettingsPayments() {
  const { available, connected } = useLoaderData<typeof loader>();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterInfo | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [feedback, setFeedback] = useState<{ type: string; message: string } | null>(null);
  const [toast, setToast] = useState("");

  const connectFetcher = useFetcher<{ success: boolean; message: string }>();
  const testFetcher = useFetcher<{ success: boolean; message: string }>();
  const disconnectFetcher = useFetcher<{ success: boolean; message: string }>();
  const defaultFetcher = useFetcher<{ success: boolean; message: string }>();

  const connectedMap = new Map(connected.map((c: any) => [c.providerKey, c]));

  const openModal = useCallback((adapter: AdapterInfo) => {
    setSelectedAdapter(adapter);
    setCredentialValues({});
    setSetAsDefault(false);
    setFeedback(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedAdapter(null);
    setCredentialValues({});
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (connectFetcher.data) {
      if (connectFetcher.data.success) { setToast(connectFetcher.data.message); closeModal(); }
      else setFeedback({ type: "error", message: connectFetcher.data.message });
    }
  }, [connectFetcher.data, closeModal]);

  useEffect(() => {
    if (testFetcher.data) setFeedback({ type: testFetcher.data.success ? "success" : "error", message: testFetcher.data.message });
  }, [testFetcher.data]);

  useEffect(() => { if (disconnectFetcher.data) setToast(disconnectFetcher.data.message); }, [disconnectFetcher.data]);
  useEffect(() => { if (defaultFetcher.data) setToast(defaultFetcher.data.message); }, [defaultFetcher.data]);

  const handleTest = useCallback(() => {
    if (!selectedAdapter) return;
    const fd = new FormData();
    fd.set("intent", "test"); fd.set("providerKey", selectedAdapter.key);
    fd.set("credentials", JSON.stringify(credentialValues));
    testFetcher.submit(fd, { method: "post" });
  }, [selectedAdapter, credentialValues, testFetcher]);

  const handleConnect = useCallback(() => {
    if (!selectedAdapter) return;
    for (const field of selectedAdapter.credentialFields) {
      if (field.required && !credentialValues[field.key]?.trim()) {
        setFeedback({ type: "error", message: `${field.label} is required.` }); return;
      }
    }
    const fd = new FormData();
    fd.set("intent", "connect"); fd.set("providerKey", selectedAdapter.key);
    fd.set("displayName", selectedAdapter.displayName);
    fd.set("credentials", JSON.stringify(credentialValues));
    fd.set("isDefault", String(setAsDefault));
    connectFetcher.submit(fd, { method: "post" });
  }, [selectedAdapter, credentialValues, setAsDefault, connectFetcher]);

  const handleDisconnect = useCallback((providerKey: string) => {
    if (!confirm("Disconnect this provider?")) return;
    const fd = new FormData();
    fd.set("intent", "disconnect"); fd.set("providerKey", providerKey);
    disconnectFetcher.submit(fd, { method: "post" });
  }, [disconnectFetcher]);

  const handleSetDefault = useCallback((providerKey: string) => {
    const fd = new FormData();
    fd.set("intent", "set_default"); fd.set("providerKey", providerKey);
    defaultFetcher.submit(fd, { method: "post" });
  }, [defaultFetcher]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/app/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Payments</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Manage your payment provider integrations</p>
        </div>
      </div>

      {toast && (
        <div className="admin-card" style={{ background: "#ECFDF5", borderLeft: "4px solid var(--admin-success)", marginBottom: 16, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 13, color: "#065f46", margin: 0 }}>{toast}</p>
          <button onClick={() => setToast("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>&times;</button>
        </div>
      )}

      {(available as AdapterInfo[]).length === 0 ? (
        <div className="admin-card" style={{ padding: 40, textAlign: "center", color: "#999" }}>No payment adapters registered.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {(available as AdapterInfo[]).map((adapter) => {
            const config = connectedMap.get(adapter.key);
            const isConnected = !!config;
            const isDefault = (config as any)?.isDefault ?? false;

            return (
              <div key={adapter.key} className="admin-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{adapter.displayName}</h3>
                  <span className={`admin-badge ${isConnected ? "success" : ""}`}>
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {adapter.isPartnerApp && <span className="admin-badge info" style={{ fontSize: 11 }}>Shopify App</span>}
                  {adapter.supportsRefund && <span className="admin-badge" style={{ fontSize: 11 }}>Refund</span>}
                  {adapter.supportsStoreCredit && <span className="admin-badge" style={{ fontSize: 11 }}>Store Credit</span>}
                  {isConnected && isDefault && <span className="admin-badge success">Default</span>}
                  {(adapter.integrationTypes || []).map((t: string) => (
                    <span key={t} className="admin-badge" style={{ fontSize: 10, textTransform: "capitalize" }}>{t.replace(/_/g, " ")}</span>
                  ))}
                </div>

                {adapter.setupNote && (
                  <p style={{ fontSize: 11, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>{adapter.setupNote}</p>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => openModal(adapter)}>
                    {isConnected ? "Manage" : "Connect"}
                  </button>
                  {isConnected && !isDefault && (
                    <button className="admin-btn admin-btn-sm" onClick={() => handleSetDefault(adapter.key)}>Set Default</button>
                  )}
                  {isConnected && (
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDisconnect(adapter.key)}>Disconnect</button>
                  )}
                  {adapter.setupGuideUrl && (
                    <a href={adapter.setupGuideUrl} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn-sm" style={{ textDecoration: "none", fontSize: 11 }}>Setup Guide</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Modal */}
      {modalOpen && selectedAdapter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(560px, 95vw)", maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Connect {selectedAdapter.displayName}</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>&times;</button>
            </div>

            {selectedAdapter.setupNote && (
              <div className="admin-card" style={{ background: "#EFF6FF", borderLeft: "4px solid var(--admin-accent)", marginBottom: 16, padding: 12 }}>
                <p style={{ fontSize: 12, color: "#1e40af", margin: 0 }}>{selectedAdapter.setupNote}</p>
                {selectedAdapter.setupGuideUrl && (
                  <a href={selectedAdapter.setupGuideUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--admin-accent)", marginTop: 4, display: "inline-block" }}>
                    Need help? View setup guide
                  </a>
                )}
                {selectedAdapter.contactEmail && (
                  <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{selectedAdapter.contactEmail}</p>
                )}
              </div>
            )}

            {feedback && (
              <div className="admin-card" style={{
                background: feedback.type === "success" ? "#ECFDF5" : "#FEF2F2",
                borderLeft: `4px solid ${feedback.type === "success" ? "var(--admin-success)" : "var(--admin-danger)"}`,
                marginBottom: 16, padding: 12,
              }}>
                <p style={{ fontSize: 13, color: feedback.type === "success" ? "#065f46" : "#991b1b", margin: 0 }}>{feedback.message}</p>
              </div>
            )}

            {selectedAdapter.credentialFields.map((field) => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  {field.label} {field.required && "*"}
                </label>
                {field.type === "select" && field.options ? (
                  <select className="admin-input" value={credentialValues[field.key] || ""} onChange={(e) => setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))} style={{ width: "100%" }}>
                    <option value="">Select...</option>
                    {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    className="admin-input"
                    type={field.type === "password" ? "password" : "text"}
                    value={credentialValues[field.key] || ""}
                    onChange={(e) => setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{ width: "100%" }}
                  />
                )}
                {field.helpText && <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{field.helpText}</p>}
              </div>
            ))}

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13 }}>
              <input type="checkbox" checked={setAsDefault} onChange={(e) => setSetAsDefault(e.target.checked)} />
              Set as default provider
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="admin-btn" onClick={handleTest} disabled={testFetcher.state !== "idle"}>
                {testFetcher.state !== "idle" ? "Testing..." : "Test Connection"}
              </button>
              <button className="admin-btn admin-btn-primary" onClick={handleConnect} disabled={connectFetcher.state !== "idle"}>
                {connectFetcher.state !== "idle" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
