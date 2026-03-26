import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const settings = await getAllSettings(shop);
  return json({ settings, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();

  // Parse all policy settings from form
  const keys = Array.from(formData.keys());
  for (const key of keys) {
    const val = formData.get(key) as string;
    // Detect booleans
    if (val === "true" || val === "false") {
      await setSetting(shop, key, val === "true");
    } else if (!isNaN(Number(val)) && val.trim() !== "") {
      await setSetting(shop, key, Number(val));
    } else {
      await setSetting(shop, key, val);
    }
  }

  return json({ saved: true });
};

// Quick links for right sidebar
const QUICK_LINKS = [
  { id: "return-window", label: "Return window" },
  { id: "exchange-window", label: "Exchange window" },
  { id: "restrict-returns", label: "Restrict return of orders" },
  { id: "restrict-exchanges", label: "Restrict exchange of orders" },
  { id: "exchange-rules", label: "Exchange Rules" },
  { id: "exchange-tags", label: "Exchange order tags" },
  { id: "exchange-other", label: "Exchange with other products" },
  { id: "price-diff", label: "Refund in case of price difference" },
  { id: "capture-payment", label: "Capture payments" },
  { id: "multi-items", label: "Return multiple items" },
  { id: "cancel-request", label: "Request cancellation" },
  { id: "auto-archive", label: "Request archive" },
  { id: "auto-refund-rejected", label: "Auto refund rejected" },
  { id: "inventory", label: "Inventory adjustments" },
  { id: "cod-refund", label: "Mark COD as refunded" },
  { id: "discount-expire", label: "Auto expire discount codes" },
  { id: "shipping-charges", label: "Shipping Charges" },
  { id: "gift-returns", label: "Gift Returns" },
  { id: "exchange-profile", label: "Exchange Order Profile" },
];

export default function PoliciesSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;

  const [form, setForm] = useState<Record<string, any>>({
    // Return Window
    return_window_days: s.return_window_days ?? 30,
    // Exchange Window
    exchange_window_days: s.exchange_window_days ?? 30,
    // Restrict returns
    restrict_return_min_value: s.restrict_return_min_value ?? "",
    restrict_return_max_value: s.restrict_return_max_value ?? "",
    restrict_return_by_tags: s.restrict_return_by_tags ?? false,
    restrict_return_tags: s.restrict_return_tags ?? "",
    restrict_return_discount_codes: s.restrict_return_discount_codes ?? false,
    restrict_return_not_delivered: s.restrict_return_not_delivered ?? false,
    // Restrict exchanges
    restrict_exchange_min_value: s.restrict_exchange_min_value ?? "",
    restrict_exchange_max_value: s.restrict_exchange_max_value ?? "",
    restrict_exchange_by_tags: s.restrict_exchange_by_tags ?? false,
    restrict_exchange_tags: s.restrict_exchange_tags ?? "",
    restrict_exchange_not_delivered: s.restrict_exchange_not_delivered ?? false,
    // Exchange rules
    exchange_replace_oos: s.exchange_replace_oos ?? false,
    exchange_add_tag: s.exchange_add_tag ?? true,
    exchange_tag_value: s.exchange_tag_value ?? "exchange-order",
    exchange_hold_orders: s.exchange_hold_orders ?? false,
    // Exchange with other products
    exchange_other_products: s.exchange_other_products ?? true,
    exchange_rules_configured: s.exchange_rules_configured ?? false,
    // Price difference
    refund_price_difference: s.refund_price_difference ?? false,
    // Capture payment
    capture_payment_price_diff: s.capture_payment_price_diff ?? false,
    capture_payment_min_amount: s.capture_payment_min_amount ?? 0,
    // Multi items
    return_multiple_items: s.return_multiple_items ?? true,
    return_multiple_times: s.return_multiple_times ?? true,
    // Request cancellation
    allow_cancel_post_pickup: s.allow_cancel_post_pickup ?? false,
    // Auto archive
    auto_archive: s.auto_archive ?? false,
    auto_archive_on_refund: s.auto_archive_on_refund ?? false,
    auto_archive_on_exchange: s.auto_archive_on_exchange ?? false,
    // Auto refund rejected
    auto_refund_rejected: s.auto_refund_rejected ?? false,
    auto_refund_rejected_additional: s.auto_refund_rejected_additional ?? false,
    // Inventory
    inventory_restock_on_receive: s.inventory_restock_on_receive ?? false,
    inventory_update_shopify: s.inventory_update_shopify ?? false,
    // COD refund
    mark_cod_refunded: s.mark_cod_refunded ?? false,
    mark_cod_delivery_refunded: s.mark_cod_delivery_refunded ?? false,
    // Discount expire
    auto_expire_discount: s.auto_expire_discount ?? false,
    // Shipping charges (managed in General settings now)
    // Gift returns
    gift_returns_enabled: s.gift_returns_enabled ?? false,
    gift_card_refund: s.gift_card_refund ?? false,
    gift_card_exchange: s.gift_card_exchange ?? false,
    // Exchange profile
    exchange_order_suffix: s.exchange_order_suffix ?? "",
    // Restocking (managed in General settings now)
    // Discount on original order
    restrict_discount_on_original: s.restrict_discount_on_original ?? false,
  });

  const u = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, String(v));
    submit(fd, { method: "post" });
  };

  return (
    <div className="dp-layout" style={{ gridTemplateColumns: "1fr 240px" }}>
      {/* Main Content */}
      <div>
        <div className="admin-page-header">
          <div>
            <a href="/app/settings" className="admin-back">‹ Settings</a>
            <h1 className="admin-page-title">Policies</h1>
          </div>
          <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>

        {actionData?.saved && <div className="admin-banner success">Policies saved!</div>}

        {/* Return Window */}
        <section id="return-window" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Return Window</h3>
          <p className="admin-item-meta" style={{ marginBottom: 12 }}>Number of days up to which customers can return.</p>
          <div className="admin-form-group">
            <input className="admin-input" type="number" value={form.return_window_days} onChange={(e) => u("return_window_days", e.target.value)} style={{ width: 120 }} />
            <p className="admin-help">You can set it to 0 if you don't want to restrict returns.</p>
          </div>
        </section>

        {/* Exchange Window */}
        <section id="exchange-window" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Exchange Window</h3>
          <p className="admin-item-meta" style={{ marginBottom: 12 }}>Number of days up to which customers can exchange.</p>
          <div className="admin-form-group">
            <input className="admin-input" type="number" value={form.exchange_window_days} onChange={(e) => u("exchange_window_days", e.target.value)} style={{ width: 120 }} />
          </div>
        </section>

        {/* Restrict Return of Orders */}
        <section id="restrict-returns" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Restrict return of orders</h3>
          <p className="admin-item-meta" style={{ marginBottom: 12 }}>Block returns based on order value, tags, or delivery status.</p>

          <div className="admin-form-row" style={{ marginBottom: 16 }}>
            <div className="admin-form-group">
              <label className="admin-label">Min order value (₹)</label>
              <input className="admin-input" type="number" value={form.restrict_return_min_value} onChange={(e) => u("restrict_return_min_value", e.target.value)} placeholder="No minimum" />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Max order value (₹)</label>
              <input className="admin-input" type="number" value={form.restrict_return_max_value} onChange={(e) => u("restrict_return_max_value", e.target.value)} placeholder="No maximum" />
            </div>
          </div>

          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.restrict_return_by_tags} onChange={(e) => u("restrict_return_by_tags", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Restrict by product tags</span>
          </label>
          {form.restrict_return_by_tags && (
            <div className="admin-form-group">
              <input className="admin-input" value={form.restrict_return_tags} onChange={(e) => u("restrict_return_tags", e.target.value)} placeholder="non-returnable, final-sale (comma separated)" />
            </div>
          )}

          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.restrict_return_discount_codes} onChange={(e) => u("restrict_return_discount_codes", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Restrict orders with discount codes</span>
          </label>

          <label className="toggle-switch" id="restrict-not-delivered">
            <input type="checkbox" checked={form.restrict_return_not_delivered} onChange={(e) => u("restrict_return_not_delivered", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Only allow returns on delivered orders</span>
          </label>
          {form.restrict_return_not_delivered && (
            <div className="admin-banner warning" style={{ marginTop: 8 }}>
              Please ensure orders are marked as delivered on your Shopify storefront before enabling this option.
            </div>
          )}
        </section>

        {/* Restrict Exchange of Orders */}
        <section id="restrict-exchanges" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Restrict exchange of orders</h3>
          <p className="admin-item-meta" style={{ marginBottom: 12 }}>Block exchanges based on order value, tags, or delivery status.</p>

          <div className="admin-form-row" style={{ marginBottom: 16 }}>
            <div className="admin-form-group">
              <label className="admin-label">Min order value (₹)</label>
              <input className="admin-input" type="number" value={form.restrict_exchange_min_value} onChange={(e) => u("restrict_exchange_min_value", e.target.value)} placeholder="No minimum" />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Max order value (₹)</label>
              <input className="admin-input" type="number" value={form.restrict_exchange_max_value} onChange={(e) => u("restrict_exchange_max_value", e.target.value)} placeholder="No maximum" />
            </div>
          </div>

          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.restrict_exchange_by_tags} onChange={(e) => u("restrict_exchange_by_tags", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Restrict by product tags</span>
          </label>
          {form.restrict_exchange_by_tags && (
            <div className="admin-form-group">
              <input className="admin-input" value={form.restrict_exchange_tags} onChange={(e) => u("restrict_exchange_tags", e.target.value)} placeholder="non-exchangeable (comma separated)" />
            </div>
          )}

          <label className="toggle-switch">
            <input type="checkbox" checked={form.restrict_exchange_not_delivered} onChange={(e) => u("restrict_exchange_not_delivered", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Only allow exchanges on delivered orders</span>
          </label>
        </section>

        {/* Exchange Rules */}
        <section id="exchange-rules" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Exchange Rules</h3>

          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.exchange_replace_oos} onChange={(e) => u("exchange_replace_oos", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Replace out-of-stock products in exchange</span>
          </label>
          <p className="admin-help" style={{ marginBottom: 16 }}>Allow customers to pick alternative products when requested variant is out of stock on Shopify.</p>

          <label className="toggle-switch" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={form.exchange_hold_orders} onChange={(e) => u("exchange_hold_orders", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Hold exchange orders on Shopify</span>
          </label>
          <p className="admin-help" style={{ marginBottom: 16 }}>Exchange orders created by Returns Manager on hold as soon as they are created.</p>
          {form.exchange_hold_orders && (
            <div className="admin-banner info">You will need to release the hold before the order is sent to fulfillment.</div>
          )}
        </section>

        {/* Exchange Tags */}
        <section id="exchange-tags" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Add tag to exchange order</h3>
          <label className="toggle-switch" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={form.exchange_add_tag} onChange={(e) => u("exchange_add_tag", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Add tag to exchange orders created on Shopify</span>
          </label>
          {form.exchange_add_tag && (
            <div className="admin-form-group" style={{ marginTop: 8 }}>
              <input className="admin-input" value={form.exchange_tag_value} onChange={(e) => u("exchange_tag_value", e.target.value)} style={{ width: 250 }} />
            </div>
          )}
        </section>

        {/* Exchange with Other Products */}
        <section id="exchange-other" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Exchange with other products</h3>
          <label className="toggle-switch" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={form.exchange_other_products} onChange={(e) => u("exchange_other_products", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Allow customers to exchange with different products</span>
          </label>
          <p className="admin-help">When enabled, customers can choose a different product during exchange instead of just a different variant of the same product.</p>
        </section>

        {/* Price Difference */}
        <section id="price-diff" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Restrict refund in case of price difference</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.refund_price_difference} onChange={(e) => u("refund_price_difference", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto refund customers in case of price difference on exchanges</span>
          </label>
          <p className="admin-help" style={{ marginTop: 8 }}>If exchange product is cheaper, refund the difference automatically.</p>
        </section>

        {/* Capture Payment */}
        <section id="capture-payment" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Capture payments from customers</h3>
          <label className="toggle-switch" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={form.capture_payment_price_diff} onChange={(e) => u("capture_payment_price_diff", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Charge customers for price difference on exchange</span>
          </label>
          {form.capture_payment_price_diff && (
            <div className="admin-form-group" style={{ marginTop: 8 }}>
              <label className="admin-label">Minimum amount to charge (₹)</label>
              <input className="admin-input" type="number" value={form.capture_payment_min_amount} onChange={(e) => u("capture_payment_min_amount", e.target.value)} style={{ width: 150 }} />
            </div>
          )}
        </section>

        {/* Return Multiple Items */}
        <section id="multi-items" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Return multiple items</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.return_multiple_items} onChange={(e) => u("return_multiple_items", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Allow customers to return multiple items at once</span>
          </label>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.return_multiple_times} onChange={(e) => u("return_multiple_times", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Allow multiple return requests per order</span>
          </label>
        </section>

        {/* Request Cancellation */}
        <section id="cancel-request" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Request cancellation post pickup</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.allow_cancel_post_pickup} onChange={(e) => u("allow_cancel_post_pickup", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Allow cancellation of requests after pickup is scheduled</span>
          </label>
        </section>

        {/* Auto Archive */}
        <section id="auto-archive" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Request archive</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.auto_archive_on_refund} onChange={(e) => u("auto_archive_on_refund", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto archive when refund is completed</span>
          </label>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.auto_archive_on_exchange} onChange={(e) => u("auto_archive_on_exchange", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto archive when exchange is fulfilled</span>
          </label>
        </section>

        {/* Auto Refund Rejected */}
        <section id="auto-refund-rejected" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Auto refund additional payment for rejected requests</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.auto_refund_rejected} onChange={(e) => u("auto_refund_rejected", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto refund for additional payments</span>
          </label>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.auto_refund_rejected_additional} onChange={(e) => u("auto_refund_rejected_additional", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Refund any additional amount when the request is rejected</span>
          </label>
        </section>

        {/* Inventory */}
        <section id="inventory" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Inventory adjustments on Shopify</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.inventory_update_shopify} onChange={(e) => u("inventory_update_shopify", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Update product inventory on Shopify upon return/exchange</span>
          </label>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.inventory_restock_on_receive} onChange={(e) => u("inventory_restock_on_receive", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Restock items when received at warehouse</span>
          </label>
        </section>

        {/* COD Refund */}
        <section id="cod-refund" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Mark Cash on Delivery orders as refunded on Shopify</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.mark_cod_refunded} onChange={(e) => u("mark_cod_refunded", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Mark COD orders as refunded on Shopify</span>
          </label>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.mark_cod_delivery_refunded} onChange={(e) => u("mark_cod_delivery_refunded", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Mark COD on Delivery orders as refunded on Shopify</span>
          </label>
        </section>

        {/* Discount Expire */}
        <section id="discount-expire" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Auto expire discount codes</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.auto_expire_discount} onChange={(e) => u("auto_expire_discount", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto expire discount codes on refund</span>
          </label>
          <p className="admin-help" style={{ marginTop: 8 }}>You can turn it on/off if you wish to not search for auto expiring any discount codes.</p>
        </section>

        {/* Shipping Charges — managed in General settings */}
        <section id="shipping-charges" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Return & Exchange Shipping Charges</h3>
          <div className="admin-banner info">
            Shipping fees and restocking fees are now configured in <a href="/app/settings/general" style={{ color: "var(--admin-accent)" }}>General Settings</a>.
          </div>
        </section>

        {/* Gift Returns */}
        <section id="gift-returns" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Gift Returns</h3>
          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.gift_returns_enabled} onChange={(e) => u("gift_returns_enabled", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Enable Gift Returns</span>
          </label>
          <p className="admin-help" style={{ marginBottom: 12 }}>We will ask users to share item details along with the return pickup or delivery address. Refund of gift order is limited to the product variants and refund is allowed to store credit only.</p>

          <label className="toggle-switch" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.gift_card_refund} onChange={(e) => u("gift_card_refund", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Gift card refund — create a new gift card and notify customer</span>
          </label>

          <label className="toggle-switch">
            <input type="checkbox" checked={form.gift_card_exchange} onChange={(e) => u("gift_card_exchange", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Gift card exchange — send gift card with return/exchange value</span>
          </label>
        </section>

        {/* Exchange Order Profile */}
        <section id="exchange-profile" className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Exchange Order Profile/Suffix</h3>
          <div className="admin-form-group">
            <label className="admin-label">Exchange order suffix</label>
            <input className="admin-input" value={form.exchange_order_suffix} onChange={(e) => u("exchange_order_suffix", e.target.value)} placeholder="e.g. -EXC" style={{ width: 200 }} />
            <p className="admin-help">This suffix will be appended to exchange order names for easy identification.</p>
          </div>
        </section>

        {/* Restrict Discount on Original */}
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <h3 className="admin-card-title">Restrict discount to used on original order</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={form.restrict_discount_on_original} onChange={(e) => u("restrict_discount_on_original", e.target.checked)} />
            <span className="toggle-slider" />
            <span className="toggle-label">Do not count the discount amount from the original order while returning the item</span>
          </label>
        </section>

        {/* Bottom Save */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
          <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Quick Links Sidebar */}
      <div className="dp-sidebar" style={{ position: "sticky", top: 20 }}>
        <div className="dp-sidebar-card">
          <div className="dp-sidebar-title">Quick links</div>
          {QUICK_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              style={{ display: "block", fontSize: 13, color: "var(--admin-accent)", textDecoration: "none", padding: "3px 0" }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
