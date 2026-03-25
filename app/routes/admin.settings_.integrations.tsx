import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import { encrypt } from "../utils/encryption.server";

import "~/adapters/logistics/index";
import "~/adapters/payments/index";
import "~/adapters/wms/index";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { paymentRegistry } from "~/adapters/payments/registry";
import { wmsRegistry } from "~/adapters/wms/registry";

// ── Types ────────────────────────────────────────────────────────────────────

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
  region: string;
  credentialFields: CredentialFieldDef[];
  supportsRefund?: boolean;
  supportsStoreCredit?: boolean;
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  region?: string;
}

interface CategoryData {
  available: AdapterInfo[];
  connected: ConnectedConfig[];
}

interface LoaderData {
  logistics: CategoryData;
  payments: CategoryData;
  wms: CategoryData;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);

  const [logisticsConfigs, paymentConfigs, wmsConfigs] = await Promise.all([
    prisma.logisticsConfig.findMany({
      where: { shop, isActive: true },
      select: { providerKey: true, displayName: true, isDefault: true, isActive: true, region: true },
    }),
    prisma.paymentConfig.findMany({
      where: { shop, isActive: true },
      select: { providerKey: true, displayName: true, isDefault: true, isActive: true },
    }),
    prisma.wmsConfig.findMany({
      where: { shop, isActive: true },
      select: { providerKey: true, displayName: true, isDefault: true, isActive: true },
    }),
  ]);

  const logisticsAvailable: AdapterInfo[] = logisticsRegistry.list().map((a) => ({
    key: a.key, displayName: a.displayName, region: a.region, credentialFields: a.credentialFields,
  }));
  const paymentsAvailable: AdapterInfo[] = paymentRegistry.list().map((a) => ({
    key: a.key, displayName: a.displayName, region: "global", credentialFields: a.credentialFields,
    supportsRefund: a.supportsRefund, supportsStoreCredit: a.supportsStoreCredit,
  }));
  const wmsAvailable: AdapterInfo[] = wmsRegistry.list().map((a) => ({
    key: a.key, displayName: a.displayName, region: "global", credentialFields: a.credentialFields,
  }));

  return json<LoaderData>({
    logistics: { available: logisticsAvailable, connected: logisticsConfigs },
    payments: { available: paymentsAvailable, connected: paymentConfigs.map((c) => ({ ...c, region: undefined })) },
    wms: { available: wmsAvailable, connected: wmsConfigs.map((c) => ({ ...c, region: undefined })) },
  });
};

// ── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const category = formData.get("category") as string;
  const providerKey = formData.get("providerKey") as string;

  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const displayName = formData.get("displayName") as string;
    const isDefault = formData.get("isDefault") === "true";
    const region = (formData.get("region") as string) || "global";

    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }

    try {
      let validationResult: { valid: boolean; error?: string } = { valid: false, error: "Unknown category" };
      if (category === "logistics") {
        const entry = logisticsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown logistics provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      } else if (category === "payments") {
        const entry = paymentRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown payment provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      } else if (category === "wms") {
        const entry = wmsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown WMS provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      }
      if (!validationResult.valid) {
        return json({ success: false, message: validationResult.error || "Credential validation failed." });
      }
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Credential validation failed." });
    }

    const encryptedCredentials = encrypt(credentialsRaw);

    if (isDefault) {
      if (category === "logistics") await prisma.logisticsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
      else if (category === "payments") await prisma.paymentConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
      else if (category === "wms") await prisma.wmsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
    }

    const upsertData = { credentials: encryptedCredentials, displayName, isDefault, isActive: true as const };
    if (category === "logistics") {
      await prisma.logisticsConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: { ...upsertData, region },
        create: { shop, providerKey, ...upsertData, region },
      });
    } else if (category === "payments") {
      await prisma.paymentConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: upsertData,
        create: { shop, providerKey, ...upsertData },
      });
    } else if (category === "wms") {
      await prisma.wmsConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: upsertData,
        create: { shop, providerKey, ...upsertData },
      });
    }

    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    if (category === "logistics") await prisma.logisticsConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    else if (category === "payments") await prisma.paymentConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    else if (category === "wms") await prisma.wmsConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    return json({ success: true, message: "Provider disconnected." });
  }

  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;
    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch { return json({ success: false, message: "Invalid credentials format." }); }

    try {
      let result: { valid: boolean; error?: string };
      if (category === "logistics") {
        const entry = logisticsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown logistics provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else if (category === "payments") {
        const entry = paymentRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown payment provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else if (category === "wms") {
        const entry = wmsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown WMS provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else {
        return json({ success: false, message: "Unknown category." });
      }
      return json({ success: result!.valid, message: result!.valid ? "Credentials validated successfully." : (result!.error || "Validation failed.") });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Connection test failed." });
    }
  }

  if (intent === "set_default") {
    if (category === "logistics") {
      await prisma.logisticsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
      await prisma.logisticsConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    } else if (category === "payments") {
      await prisma.paymentConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
      await prisma.paymentConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    } else if (category === "wms") {
      await prisma.wmsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
      await prisma.wmsConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    }
    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

// ── Component ────────────────────────────────────────────────────────────────

const TABS = ["Payments", "WMS", "Chat", "Mobile", "Marketing & CRM"];

export default function AdminIntegrations() {
  const data = useLoaderData<typeof loader>() as LoaderData;
  const [selectedTab, setSelectedTab] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, type: isError ? "error" : "success" });
  }, []);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <a href="/admin/settings" className="admin-back">&lsaquo; Settings</a>
          <h1 className="admin-page-title">Integrations</h1>
          <p style={{ color: "var(--admin-text-muted)", fontSize: 14, marginTop: 4 }}>
            Connect your logistics, payment, and WMS providers
          </p>
        </div>
      </div>

      {toast && (
        <div className={`admin-banner ${toast.type === "error" ? "error" : "success"}`}>
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--admin-border)", marginBottom: 24 }}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(i)}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: selectedTab === i ? 600 : 400,
              color: selectedTab === i ? "var(--admin-accent)" : "var(--admin-text-muted)",
              background: "none",
              border: "none",
              borderBottom: selectedTab === i ? "2px solid var(--admin-accent)" : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {selectedTab === 0 && (
        <ProviderGrid category="payments" adapters={data.payments.available} connected={data.payments.connected} showToast={showToast} />
      )}
      {selectedTab === 1 && (
        <ProviderGrid category="wms" adapters={data.wms.available} connected={data.wms.connected} showToast={showToast} />
      )}
      {selectedTab === 2 && <ComingSoon title="Chat Integrations" description="Connect WhatsApp and helpdesk platforms. Webhook endpoints available at /api/webhooks/chat/{provider}" />}
      {selectedTab === 3 && <ComingSoon title="Mobile App Builders" description="Sync returns data with Vajro, Tapcart, and other mobile commerce platforms." />}
      {selectedTab === 4 && <ComingSoon title="Marketing & CRM" description="Connect returns data to Klaviyo, HubSpot, and other platforms for customer retention workflows." />}
    </>
  );
}

// ── Provider Grid ────────────────────────────────────────────────────────────

interface ProviderGridProps {
  category: "logistics" | "payments" | "wms";
  adapters: AdapterInfo[];
  connected: ConnectedConfig[];
  showToast: (message: string, isError?: boolean) => void;
}

function ProviderGrid({ category, adapters, connected, showToast }: ProviderGridProps) {
  const [modalAdapter, setModalAdapter] = useState<AdapterInfo | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const connectFetcher = useFetcher<{ success: boolean; message: string }>();
  const testFetcher = useFetcher<{ success: boolean; message: string }>();
  const disconnectFetcher = useFetcher<{ success: boolean; message: string }>();
  const defaultFetcher = useFetcher<{ success: boolean; message: string }>();

  const connectedMap = new Map(connected.map((c) => [c.providerKey, c]));

  const openModal = useCallback((adapter: AdapterInfo) => {
    setModalAdapter(adapter);
    setCredValues({});
    setSetAsDefault(false);
    setFeedback(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalAdapter(null);
    setCredValues({});
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (connectFetcher.data) {
      if (connectFetcher.data.success) { showToast(connectFetcher.data.message); closeModal(); }
      else setFeedback({ type: "error", message: connectFetcher.data.message });
    }
  }, [connectFetcher.data, showToast, closeModal]);

  useEffect(() => {
    if (testFetcher.data) {
      setFeedback({ type: testFetcher.data.success ? "success" : "error", message: testFetcher.data.message });
    }
  }, [testFetcher.data]);

  useEffect(() => {
    if (disconnectFetcher.data) showToast(disconnectFetcher.data.message, !disconnectFetcher.data.success);
  }, [disconnectFetcher.data, showToast]);

  useEffect(() => {
    if (defaultFetcher.data) showToast(defaultFetcher.data.message, !defaultFetcher.data.success);
  }, [defaultFetcher.data, showToast]);

  const handleConnect = useCallback(() => {
    if (!modalAdapter) return;
    for (const field of modalAdapter.credentialFields) {
      if (field.required && !credValues[field.key]?.trim()) {
        setFeedback({ type: "error", message: `${field.label} is required.` });
        return;
      }
    }
    const fd = new FormData();
    fd.set("intent", "connect");
    fd.set("category", category);
    fd.set("providerKey", modalAdapter.key);
    fd.set("displayName", modalAdapter.displayName);
    fd.set("credentials", JSON.stringify(credValues));
    fd.set("isDefault", String(setAsDefault));
    fd.set("region", modalAdapter.region || "global");
    connectFetcher.submit(fd, { method: "post" });
  }, [modalAdapter, category, credValues, setAsDefault, connectFetcher]);

  const handleTest = useCallback(() => {
    if (!modalAdapter) return;
    const fd = new FormData();
    fd.set("intent", "test");
    fd.set("category", category);
    fd.set("providerKey", modalAdapter.key);
    fd.set("credentials", JSON.stringify(credValues));
    testFetcher.submit(fd, { method: "post" });
  }, [modalAdapter, category, credValues, testFetcher]);

  const handleDisconnect = useCallback((providerKey: string) => {
    const fd = new FormData();
    fd.set("intent", "disconnect");
    fd.set("category", category);
    fd.set("providerKey", providerKey);
    disconnectFetcher.submit(fd, { method: "post" });
  }, [category, disconnectFetcher]);

  const handleSetDefault = useCallback((providerKey: string) => {
    const fd = new FormData();
    fd.set("intent", "set_default");
    fd.set("category", category);
    fd.set("providerKey", providerKey);
    defaultFetcher.submit(fd, { method: "post" });
  }, [category, defaultFetcher]);

  if (adapters.length === 0) {
    return <div className="admin-card"><p style={{ color: "var(--admin-text-muted)" }}>No {category} adapters registered.</p></div>;
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {adapters.map((adapter) => {
          const config = connectedMap.get(adapter.key);
          const isConnected = !!config;
          const isDefault = config?.isDefault ?? false;

          return (
            <div key={adapter.key} className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <strong style={{ fontSize: 15 }}>{adapter.displayName}</strong>
                <span className={`admin-badge ${isConnected ? "delivered" : "pending"}`}>
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              </div>

              <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Region: {adapter.region}</span>

              {adapter.supportsRefund !== undefined && (
                <div style={{ display: "flex", gap: 6 }}>
                  {adapter.supportsRefund && <span className="admin-badge info" style={{ fontSize: 11 }}>Refund</span>}
                  {adapter.supportsStoreCredit && <span className="admin-badge info" style={{ fontSize: 11 }}>Store Credit</span>}
                </div>
              )}

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

      {/* Modal */}
      {modalAdapter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 0 }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Connect {modalAdapter.displayName}</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--admin-text-muted)" }}>&times;</button>
            </div>

            {/* Body */}
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {feedback && (
                <div className={`admin-banner ${feedback.type === "success" ? "success" : "error"}`}>
                  {feedback.message}
                </div>
              )}

              {modalAdapter.credentialFields.map((field) => (
                <div key={field.key} className="admin-form-group">
                  <label className="admin-label">
                    {field.label} {field.required && <span style={{ color: "var(--admin-danger)" }}>*</span>}
                  </label>
                  {field.type === "select" && field.options ? (
                    <select
                      className="admin-input"
                      value={credValues[field.key] || ""}
                      onChange={(e) => setCredValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      style={{ marginTop: 4 }}
                    >
                      <option value="">Select...</option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="admin-input"
                      type={field.type === "password" ? "password" : "text"}
                      value={credValues[field.key] || ""}
                      onChange={(e) => setCredValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      style={{ marginTop: 4 }}
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

            {/* Footer */}
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

// ── Coming Soon ──────────────────────────────────────────────────────────────

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="admin-card">
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
      <div className="admin-banner info">{description}</div>
      <p style={{ fontSize: 13, color: "var(--admin-text-muted)", marginTop: 12 }}>
        This integration category is on the roadmap. Contact support if you need early access.
      </p>
    </div>
  );
}
