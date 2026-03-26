import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { getAllSettings, setSetting } from "../services/settings.server";
import { shopifyREST } from "../services/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, accessToken } = await requireAppAuth(request);
  const settings = await getAllSettings(shop);
  const shopConfig = await prisma.shop.findUnique({ where: { shop } });
  const appUrl = process.env.SHOPIFY_APP_URL || "";

  // Check if snippet is installed on theme
  let snippetInstalled = false;
  try {
    const themesRes = await shopifyREST(shop, accessToken, "GET", "/themes.json");
    const activeTheme = (themesRes?.themes || []).find((t: any) => t.role === "main");
    if (activeTheme) {
      const asset = await shopifyREST(shop, accessToken, "GET", `/themes/${activeTheme.id}/assets.json?asset[key]=snippets/returns-manager.liquid`);
      snippetInstalled = !!asset?.asset?.value;
    }
  } catch { /* snippet not found */ }

  return json({ settings, shopConfig, shop, appUrl, snippetInstalled });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, accessToken } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Handle auto-install snippet to Shopify theme
  if (intent === "install_snippet") {
    try {
      const appUrl = process.env.SHOPIFY_APP_URL || "";
      const snippetContent = `<!-- Returns Manager - Return/Exchange Button -->\n<script>\n(function(){\n  var APP_URL="${appUrl}";\n  var SHOP="${shop}";\n  var rows=document.querySelectorAll('table tbody tr, .order-list-item, [data-order]');\n  rows.forEach(function(row){\n    var link=row.querySelector('a[href*="/orders/"]');\n    if(!link) return;\n    var name=link.textContent.trim().replace('#','');\n    var btn=document.createElement('a');\n    btn.href=APP_URL+'/portal/'+SHOP+'?order='+encodeURIComponent(name);\n    btn.textContent='Return / Exchange';\n    btn.className='btn returns-manager-btn';\n    btn.style.cssText='display:inline-block;padding:8px 16px;background:#000;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:6px 0;';\n    var target=row.querySelector('td:last-child')||row;\n    target.appendChild(document.createElement('br'));\n    target.appendChild(btn);\n  });\n})();\n</script>`;

      // Get the active theme
      const themesRes = await shopifyREST(shop, accessToken, "GET", "/themes.json");
      const activeTheme = (themesRes?.themes || []).find((t: any) => t.role === "main");
      if (!activeTheme) return json({ error: "Could not find active theme" }, { status: 400 });

      // Upload the snippet as a theme asset
      // Upload the snippet file
      await shopifyREST(shop, accessToken, "PUT", `/themes/${activeTheme.id}/assets.json`, {
        asset: { key: "snippets/returns-manager.liquid", value: snippetContent },
      });

      // Try to auto-inject into layout/theme.liquid before </body>
      try {
        const layoutAsset = await shopifyREST(shop, accessToken, "GET", `/themes/${activeTheme.id}/assets.json?asset[key]=layout/theme.liquid`);
        const layoutContent = layoutAsset?.asset?.value || "";
        if (layoutContent && !layoutContent.includes("returns-manager")) {
          const updated = layoutContent.replace("</body>", "{% render 'returns-manager' %}\n</body>");
          await shopifyREST(shop, accessToken, "PUT", `/themes/${activeTheme.id}/assets.json`, {
            asset: { key: "layout/theme.liquid", value: updated },
          });
        }
      } catch (e) {
        // Fallback: try customer account template
        try {
          const accountAsset = await shopifyREST(shop, accessToken, "GET", `/themes/${activeTheme.id}/assets.json?asset[key]=templates/customers/account.liquid`);
          const accountContent = accountAsset?.asset?.value || "";
          if (accountContent && !accountContent.includes("returns-manager")) {
            const updated = accountContent + "\n{% render 'returns-manager' %}\n";
            await shopifyREST(shop, accessToken, "PUT", `/themes/${activeTheme.id}/assets.json`, {
              asset: { key: "templates/customers/account.liquid", value: updated },
            });
          }
        } catch { /* Template might be JSON-based (newer themes) — that's OK, snippet is still installed */ }
      }

      await setSetting(shop, "account_snippet_enabled", true);
      return json({ saved: true, message: "Snippet installed on your theme! The Return/Exchange button will appear on your customer account page." });
    } catch (e: any) {
      console.error("[Snippet Install]", e);
      return json({ error: "Failed to install snippet. Please try again." }, { status: 500 });
    }
  }

  // Save all settings to key-value store
  const settingsToSave: Record<string, unknown> = {
    return_window_days: parseInt(formData.get("return_window_days") as string) || 30,
    restocking_fee_pct: parseFloat(formData.get("restocking_fee_pct") as string) || 0,
    return_shipping_fee: parseFloat(formData.get("return_shipping_fee") as string) || 100,
    auto_approve: formData.get("auto_approve") === "true",
    account_snippet_enabled: formData.get("account_snippet_enabled") === "true",
    sync_returns_shopify: formData.get("sync_returns_shopify") === "true",
    enable_email_otp: formData.get("enable_email_otp") === "true",
    portal_button_color: (formData.get("portal_button_color") as string) || "#C84B31",
    portal_banner_url: (formData.get("portal_banner_url") as string) || "",
    tax_rate_pct: parseFloat(formData.get("tax_rate_pct") as string) || 0,
    exchange_shipping_fee: parseFloat(formData.get("exchange_shipping_fee") as string) || 0,
    nudge_exchange_enabled: formData.get("nudge_exchange_enabled") === "true",
    nudge_store_credit_enabled: formData.get("nudge_store_credit_enabled") === "true",
    nudge_exchange_bonus: parseFloat(formData.get("nudge_exchange_bonus") as string) || 0,
    nudge_store_credit_bonus: parseFloat(formData.get("nudge_store_credit_bonus") as string) || 0,
    nudge_exchange_message: (formData.get("nudge_exchange_message") as string) || "",
    nudge_store_credit_message: (formData.get("nudge_store_credit_message") as string) || "",
    store_email: (formData.get("store_email") as string) || "",
    store_phone: (formData.get("store_phone") as string) || "",
  };

  for (const [key, value] of Object.entries(settingsToSave)) {
    await setSetting(shop, key, value);
  }

  // Save warehouse to Shop model
  await prisma.shop.update({
    where: { shop },
    data: {
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

export default function GeneralSettings() {
  const { settings, shopConfig, shop, appUrl, snippetInstalled } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

  const s = settings as Record<string, any>;
  const sc = shopConfig as any;

  const [form, setForm] = useState({
    // Return Policy
    return_window_days: String(s.return_window_days ?? 30),
    restocking_fee_pct: String(s.restocking_fee_pct ?? 0),
    return_shipping_fee: String(s.return_shipping_fee ?? 100),
    auto_approve: Boolean(s.auto_approve ?? true),
    // Account Page
    account_snippet_enabled: Boolean(s.account_snippet_enabled ?? false),
    // Sync
    sync_returns_shopify: Boolean(s.sync_returns_shopify ?? true),
    // OTP
    enable_email_otp: Boolean(s.enable_email_otp ?? false),
    // Customization
    portal_button_color: String(s.portal_button_color || "#C84B31"),
    portal_banner_url: String(s.portal_banner_url || ""),
    // Fees
    exchange_shipping_fee: String(s.exchange_shipping_fee ?? 0),
    // Nudges
    nudge_exchange_enabled: Boolean(s.nudge_exchange_enabled ?? true),
    nudge_store_credit_enabled: Boolean(s.nudge_store_credit_enabled ?? true),
    nudge_exchange_bonus: String(s.nudge_exchange_bonus ?? 0),
    nudge_store_credit_bonus: String(s.nudge_store_credit_bonus ?? 0),
    nudge_exchange_message: String(s.nudge_exchange_message || ""),
    nudge_store_credit_message: String(s.nudge_store_credit_message || ""),
    // Tax
    tax_rate_pct: String(s.tax_rate_pct ?? 0),
    // Store Info
    store_email: String(s.store_email || ""),
    store_phone: String(s.store_phone || ""),
    // Warehouse
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

  const portalUrl = `${appUrl}/portal/${shop}`;

  const snippetCode = `<!-- Returns Manager - Return/Exchange Button -->
<script>
(function(){
  var APP_URL = "${appUrl}";
  var SHOP = "${shop}";
  document.querySelectorAll('.order-table tbody tr, [data-order]').forEach(function(row) {
    var orderLink = row.querySelector('a[href*="/orders/"]');
    if (!orderLink) return;
    var orderName = orderLink.textContent.trim();
    var btn = document.createElement('a');
    btn.href = APP_URL + '/portal/' + SHOP + '?order=' + encodeURIComponent(orderName.replace('#',''));
    btn.textContent = 'Return / Exchange';
    btn.style.cssText = 'display:inline-block;padding:8px 16px;background:#000;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin-top:6px;';
    var cell = row.querySelector('td:last-child') || row.appendChild(document.createElement('td'));
    cell.appendChild(btn);
  });
})();
</script>`;

  const copyUrl = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySnippet = () => {
    navigator.clipboard.writeText(snippetCode);
    setSnippetCopied(true);
    setTimeout(() => setSnippetCopied(false), 2000);
  };

  const [emailCopied, setEmailCopied] = useState(false);
  const emailSnippet = `<!-- Returns Manager - Return/Exchange Link -->
<table class="row">
  <tr>
    <td class="shop-name__cell" style="padding:20px 0;">
      <center>
        <a href="${appUrl}/portal/${shop}?order={{ order.name | remove: '#' }}"
           style="display:inline-block;padding:12px 28px;background:#000;color:#fff;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;">
          Request Return / Exchange
        </a>
        <p style="font-size:12px;color:#999;margin-top:8px;">
          Not happy with your order? Start a return or exchange.
        </p>
      </center>
    </td>
  </tr>
</table>`;

  const copyEmail = () => {
    navigator.clipboard.writeText(emailSnippet);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <a href="/app/settings" className="admin-back">‹ Settings</a>
          <h1 className="admin-page-title">General</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save"}
        </button>
      </div>

      {actionData?.saved && <div className="admin-banner success">Settings saved successfully!</div>}

      {/* Account Page Snippet */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Account Page</h3>
          <p className="settings-section-desc">
            Let your customers Return/Exchange from My account section directly. An option will be included against each order once you install the snippet on your theme.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>
                The snippet is <strong>{form.account_snippet_enabled ? "Enabled" : "Disabled"}</strong> on your store.
              </span>
              <span className={`admin-badge ${snippetInstalled ? "delivered" : "pending"}`}>
                {snippetInstalled ? "Installed" : "Not Installed"}
              </span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.account_snippet_enabled} onChange={(e) => u("account_snippet_enabled", e.target.checked)} />
              <span className="toggle-slider" />
              <span className="toggle-label">Enable</span>
            </label>
            <hr className="admin-divider" />
            <p style={{ fontSize: 13, color: "var(--admin-text-muted)", marginBottom: 8 }}>
              Copy the snippet below and paste it in your theme's <code>customers/account.liquid</code> file:
            </p>
            <div style={{ background: "#1a1a2e", color: "#a0a0b8", padding: 12, borderRadius: 6, fontSize: 12, fontFamily: "monospace", maxHeight: 150, overflow: "auto", marginBottom: 8 }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{snippetCode}</pre>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="admin-btn admin-btn-sm" onClick={copySnippet}>
                {snippetCopied ? "Copied!" : "Copy Snippet"}
              </button>
              <button
                className="admin-btn admin-btn-sm admin-btn-primary"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("intent", "install_snippet");
                  submit(fd, { method: "post" });
                }}
                disabled={isLoading}
              >
                {isLoading ? "Installing..." : "Auto Install to Theme"}
              </button>
            </div>
            {actionData?.message && (
              <div className="admin-banner info" style={{ marginTop: 8 }}>{actionData.message}</div>
            )}
          </div>
        </div>
      </div>

      {/* Returns Page URL */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Returns Page</h3>
          <p className="settings-section-desc">
            Your own returns page for customers to request a return/exchange.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="admin-label">Your returns page URL</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <div style={{ flex: 1, padding: "8px 12px", background: "#f0f0ff", borderRadius: 6, fontSize: 14, fontFamily: "monospace", color: "var(--admin-accent)" }}>
                <a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                  {portalUrl} ↗
                </a>
              </div>
              <button className="admin-btn admin-btn-sm" onClick={copyUrl}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Shopify Store */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Shopify store</h3>
          <p className="settings-section-desc">
            Connected directly to your Shopify store.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="admin-label">Connected store URL</label>
            <input className="admin-input" value={shop} disabled style={{ background: "#f9fafb", marginTop: 4 }} />
          </div>
        </div>
      </div>

      {/* Email Notification */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Order Confirmation Email</h3>
          <p className="settings-section-desc">
            Add a "Return / Exchange" button to your Shopify order confirmation emails. Go to Shopify Admin → Settings → Notifications → Order confirmation → paste this code.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <div style={{ background: "#1a1a2e", color: "#a0a0b8", padding: 12, borderRadius: 6, fontSize: 12, fontFamily: "monospace", maxHeight: 150, overflow: "auto", marginBottom: 8 }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{emailSnippet}</pre>
            </div>
            <button className="admin-btn admin-btn-sm" onClick={copyEmail}>
              {emailCopied ? "Copied!" : "Copy Email Snippet"}
            </button>
            <p className="admin-help" style={{ marginTop: 8 }}>
              Paste this at the bottom of your order confirmation email template in Shopify → Settings → Notifications.
            </p>
          </div>
        </div>
      </div>

      {/* Sync Returns */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Sync returns data on Shopify</h3>
          <p className="settings-section-desc">
            Marks orders as returned on your Shopify store, keep accounting in sync and get full view of the returns activity.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="toggle-switch">
              <input type="checkbox" checked={form.sync_returns_shopify} onChange={(e) => u("sync_returns_shopify", e.target.checked)} />
              <span className="toggle-slider" />
              <span className="toggle-label">Sync returns status on Shopify</span>
            </label>
          </div>
        </div>
      </div>

      {/* Email OTP Flow */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Enable Email OTP flow</h3>
          <p className="settings-section-desc">
            Allow your customers to submit return or exchange requests after verifying their identity through Email OTP authentication.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="toggle-switch">
              <input type="checkbox" checked={form.enable_email_otp} onChange={(e) => u("enable_email_otp", e.target.checked)} />
              <span className="toggle-slider" />
              <span className="toggle-label">Enable Email OTP flow</span>
            </label>
            {form.enable_email_otp && (
              <div className="admin-banner info" style={{ marginTop: 12 }}>
                When this option is enabled, we will not require the Order Number. Customers verify via email OTP instead.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customization */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Customization</h3>
          <p className="settings-section-desc">
            Define the color of your brand and greet your customers with a relevant image on your returns page.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-label">Button color</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input
                    type="color"
                    value={form.portal_button_color}
                    onChange={(e) => u("portal_button_color", e.target.value)}
                    style={{ width: 48, height: 36, border: "1px solid var(--admin-border)", borderRadius: 6, cursor: "pointer", padding: 2 }}
                  />
                  <input
                    className="admin-input"
                    value={form.portal_button_color}
                    onChange={(e) => u("portal_button_color", e.target.value)}
                    style={{ width: 120, fontFamily: "monospace" }}
                  />
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Returns Page Banner</label>
                <input
                  className="admin-input"
                  placeholder="https://example.com/banner.jpg"
                  value={form.portal_banner_url}
                  onChange={(e) => u("portal_banner_url", e.target.value)}
                  style={{ marginTop: 4 }}
                />
                <p className="admin-help">Recommended size: 1024px x 200px</p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="admin-btn admin-btn-sm"
              >
                Preview your returns page ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Incentives & Nudges */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Customer Incentives</h3>
          <p className="settings-section-desc">
            Influence customer decisions by suggesting exchanges or store credit with optional bonus amounts.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="toggle-switch" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={form.nudge_exchange_enabled} onChange={(e) => u("nudge_exchange_enabled", e.target.checked)} />
              <span className="toggle-slider" />
              <span className="toggle-label">Suggest exchange instead of return</span>
            </label>
            {form.nudge_exchange_enabled && (
              <div style={{ marginLeft: 8, marginBottom: 16 }}>
                <div className="admin-form-row">
                  <div className="admin-form-group">
                    <label className="admin-label">Exchange bonus amount</label>
                    <input className="admin-input" type="number" value={form.nudge_exchange_bonus} onChange={(e) => u("nudge_exchange_bonus", e.target.value)} style={{ width: 120 }} />
                    <p className="admin-help">Extra credit customers get if they choose exchange</p>
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Custom message (optional)</label>
                    <input className="admin-input" value={form.nudge_exchange_message} onChange={(e) => u("nudge_exchange_message", e.target.value)} placeholder="e.g. Exchange now and save on shipping!" />
                  </div>
                </div>
              </div>
            )}
            <hr className="admin-divider" />
            <label className="toggle-switch" style={{ marginTop: 12, marginBottom: 12 }}>
              <input type="checkbox" checked={form.nudge_store_credit_enabled} onChange={(e) => u("nudge_store_credit_enabled", e.target.checked)} />
              <span className="toggle-slider" />
              <span className="toggle-label">Suggest store credit instead of refund</span>
            </label>
            {form.nudge_store_credit_enabled && (
              <div style={{ marginLeft: 8 }}>
                <div className="admin-form-row">
                  <div className="admin-form-group">
                    <label className="admin-label">Store credit bonus amount</label>
                    <input className="admin-input" type="number" value={form.nudge_store_credit_bonus} onChange={(e) => u("nudge_store_credit_bonus", e.target.value)} style={{ width: 120 }} />
                    <p className="admin-help">Extra amount added to store credit</p>
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Custom message (optional)</label>
                    <input className="admin-input" value={form.nudge_store_credit_message} onChange={(e) => u("nudge_store_credit_message", e.target.value)} placeholder="e.g. Get instant credit for your next purchase!" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tax Rate */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Tax rate</h3>
          <p className="settings-section-desc">
            Set a tax rate for your products if the prices are not inclusive of taxes on your Shopify store.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <label className="admin-label">What is the tax rate applicable on your products?</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text-muted)" }}>%</span>
              <input className="admin-input" type="number" value={form.tax_rate_pct} onChange={(e) => u("tax_rate_pct", e.target.value)} style={{ width: 120 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Store Information */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Store information</h3>
          <p className="settings-section-desc">
            We'll only use this info to send you important updates — like billing changes, account access, or urgent support. No spam, ever.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-label">Account email</label>
                <input className="admin-input" type="email" value={form.store_email} onChange={(e) => u("store_email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Account Phone</label>
                <input className="admin-input" type="tel" value={form.store_phone} onChange={(e) => u("store_phone", e.target.value)} placeholder="9876543210" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Return Policy */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Return Policy</h3>
          <p className="settings-section-desc">
            Configure your return window, fees, and auto-approval settings.
          </p>
        </div>
        <div className="settings-section-right">
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
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-label">Return Shipping Fee</label>
                <input className="admin-input" type="number" value={form.return_shipping_fee} onChange={(e) => u("return_shipping_fee", e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">&nbsp;</label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.auto_approve} onChange={(e) => u("auto_approve", e.target.checked)} />
                  <span className="toggle-slider" />
                  <span className="toggle-label">Auto-approve return requests</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exchange Shipping Fee */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Shipping & Fees</h3>
          <p className="settings-section-desc">
            Configure shipping fees and restocking fees for returns and exchanges.
          </p>
        </div>
        <div className="settings-section-right">
          <div className="admin-card">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-label">Return Shipping Fee</label>
                <input className="admin-input" type="number" value={form.return_shipping_fee} onChange={(e) => u("return_shipping_fee", e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Exchange Shipping Fee</label>
                <input className="admin-input" type="number" value={form.exchange_shipping_fee} onChange={(e) => u("exchange_shipping_fee", e.target.value)} />
              </div>
            </div>
            <div className="admin-form-group" style={{ marginTop: 8 }}>
              <label className="admin-label">Restocking Fee (%)</label>
              <input className="admin-input" type="number" value={form.restocking_fee_pct} onChange={(e) => u("restocking_fee_pct", e.target.value)} style={{ width: 120 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Warehouse */}
      <div className="settings-section-row">
        <div className="settings-section-left">
          <h3 className="settings-section-title">Warehouse</h3>
          <p className="settings-section-desc">
            Your warehouse/pickup address for returns.
          </p>
        </div>
        <div className="settings-section-right">
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
      </div>

      {/* Bottom Save */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save"}
        </button>
      </div>
    </>
  );
}
