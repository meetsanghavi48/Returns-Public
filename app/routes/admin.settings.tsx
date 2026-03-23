import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const settings = await getAllSettings(shop);
  const shopConfig = await prisma.shop.findUnique({ where: { shop } });
  return json({ settings, shopConfig, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();

  const settingsMap: Record<string, unknown> = {
    return_window_days: parseInt(formData.get("return_window_days") as string) || 30,
    restocking_fee_pct: parseFloat(formData.get("restocking_fee_pct") as string) || 0,
    return_shipping_fee: parseFloat(formData.get("return_shipping_fee") as string) || 100,
    auto_approve: formData.get("auto_approve") === "true",
  };

  for (const [key, value] of Object.entries(settingsMap)) {
    await setSetting(shop, key, value);
  }

  await prisma.shop.update({
    where: { shop },
    data: {
      delhiveryToken: (formData.get("delhivery_token") as string) || null,
      delhiveryWarehouse: (formData.get("delhivery_warehouse") as string) || null,
      easebuzzKey: (formData.get("easebuzz_key") as string) || null,
      easebuzzSalt: (formData.get("easebuzz_salt") as string) || null,
      easebuzzMid: (formData.get("easebuzz_mid") as string) || null,
      easebuzzEnv: (formData.get("easebuzz_env") as string) || "test",
      warehouseName: (formData.get("warehouse_name") as string) || null,
      warehouseAddress: (formData.get("warehouse_address") as string) || null,
      warehouseCity: (formData.get("warehouse_city") as string) || null,
      warehouseState: (formData.get("warehouse_state") as string) || null,
      warehousePincode: (formData.get("warehouse_pincode") as string) || null,
      warehousePhone: (formData.get("warehouse_phone") as string) || null,
    },
  });

  return json({ saved: true });
};

export default function AdminSettings() {
  const { settings, shopConfig, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;
  const sc = shopConfig as any;

  const [form, setForm] = useState({
    return_window_days: String(s.return_window_days ?? 30),
    restocking_fee_pct: String(s.restocking_fee_pct ?? 0),
    return_shipping_fee: String(s.return_shipping_fee ?? 100),
    auto_approve: Boolean(s.auto_approve ?? true),
    delhivery_token: sc?.delhiveryToken || "",
    delhivery_warehouse: sc?.delhiveryWarehouse || "",
    easebuzz_key: sc?.easebuzzKey || "",
    easebuzz_salt: sc?.easebuzzSalt || "",
    easebuzz_mid: sc?.easebuzzMid || "",
    easebuzz_env: sc?.easebuzzEnv || "test",
    warehouse_name: sc?.warehouseName || "",
    warehouse_address: sc?.warehouseAddress || "",
    warehouse_city: sc?.warehouseCity || "",
    warehouse_state: sc?.warehouseState || "",
    warehouse_pincode: sc?.warehousePincode || "",
    warehouse_phone: sc?.warehousePhone || "",
  });

  const u = (key: string, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, String(v));
    submit(fd, { method: "post" });
  };

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Settings</h1>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {actionData?.saved && (
        <div className="admin-banner success">Settings saved successfully!</div>
      )}

      {/* Return Policy */}
      <div className="admin-section">
        <h2 className="admin-section-title">Return Policy</h2>
        <p className="admin-section-desc">Configure your return window, fees, and auto-approval.</p>
        <div className="admin-card">
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Return Window (days)</label>
              <input className="admin-input" type="number" value={form.return_window_days} onChange={(e) => u("return_window_days", e.target.value)} />
              <p className="admin-help">Days after fulfillment customers can request returns.</p>
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Restocking Fee (%)</label>
              <input className="admin-input" type="number" value={form.restocking_fee_pct} onChange={(e) => u("restocking_fee_pct", e.target.value)} />
              <p className="admin-help">Percentage deducted from refund. 0 = no fee.</p>
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Return Shipping Fee (₹)</label>
              <input className="admin-input" type="number" value={form.return_shipping_fee} onChange={(e) => u("return_shipping_fee", e.target.value)} />
              <p className="admin-help">Flat fee for original payment refunds. Not applied to store credit.</p>
            </div>
            <div className="admin-form-group">
              <label className="admin-label">&nbsp;</label>
              <div className="admin-checkbox-row">
                <input type="checkbox" checked={form.auto_approve} onChange={(e) => u("auto_approve", e.target.checked)} />
                <span style={{ fontSize: 14 }}>Auto-approve return requests</span>
              </div>
              <p className="admin-help">Automatically approve on submission.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Warehouse */}
      <div className="admin-section">
        <h2 className="admin-section-title">Warehouse</h2>
        <p className="admin-section-desc">Your warehouse/pickup address for Delhivery pickups.</p>
        <div className="admin-card">
          <div className="admin-form-group">
            <label className="admin-label">Name</label>
            <input className="admin-input" value={form.warehouse_name} onChange={(e) => u("warehouse_name", e.target.value)} />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Address</label>
            <textarea className="admin-input" rows={2} value={form.warehouse_address} onChange={(e) => u("warehouse_address", e.target.value)} />
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">City</label>
              <input className="admin-input" value={form.warehouse_city} onChange={(e) => u("warehouse_city", e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">State</label>
              <input className="admin-input" value={form.warehouse_state} onChange={(e) => u("warehouse_state", e.target.value)} />
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Pincode</label>
              <input className="admin-input" value={form.warehouse_pincode} onChange={(e) => u("warehouse_pincode", e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Phone</label>
              <input className="admin-input" value={form.warehouse_phone} onChange={(e) => u("warehouse_phone", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Delhivery */}
      <div className="admin-section">
        <h2 className="admin-section-title">Delhivery</h2>
        <p className="admin-section-desc">Configure your Delhivery logistics integration.</p>
        <div className="admin-card">
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">API Token</label>
              <input className="admin-input" type="password" value={form.delhivery_token} onChange={(e) => u("delhivery_token", e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Warehouse Name (in Delhivery)</label>
              <input className="admin-input" value={form.delhivery_warehouse} onChange={(e) => u("delhivery_warehouse", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Easebuzz */}
      <div className="admin-section">
        <h2 className="admin-section-title">Easebuzz Payments</h2>
        <p className="admin-section-desc">Configure Easebuzz for exchange price difference payments.</p>
        <div className="admin-card">
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Key</label>
              <input className="admin-input" value={form.easebuzz_key} onChange={(e) => u("easebuzz_key", e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Salt</label>
              <input className="admin-input" type="password" value={form.easebuzz_salt} onChange={(e) => u("easebuzz_salt", e.target.value)} />
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Merchant ID</label>
              <input className="admin-input" value={form.easebuzz_mid} onChange={(e) => u("easebuzz_mid", e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Environment</label>
              <select className="admin-select" value={form.easebuzz_env} onChange={(e) => u("easebuzz_env", e.target.value)}>
                <option value="test">Test</option>
                <option value="prod">Production</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Portal URL */}
      <div className="admin-section">
        <h2 className="admin-section-title">Customer Portal</h2>
        <p className="admin-section-desc">Share this URL with your customers.</p>
        <div className="admin-card">
          <div style={{ fontSize: 14, fontWeight: 600, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, fontFamily: "monospace" }}>
            {typeof window !== "undefined" ? window.location.origin : process.env.SHOPIFY_APP_URL || "[your-app-url]"}/portal/{shop}
          </div>
          <p className="admin-help" style={{ marginTop: 8 }}>
            You can also use the Shopify App Proxy (apps/returns) to serve this under your store domain.
          </p>
        </div>
      </div>
    </>
  );
}
