import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../services/admin-session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  return json({ shop });
};

const SETTINGS_CARDS = [
  { icon: "⚙️", title: "General", desc: "View and update your store details", href: "/admin/settings/general" },
  { icon: "🌐", title: "Languages", desc: "Show your return portal in multiple languages", href: "/admin/settings/languages" },
  { icon: "📋", title: "Policies", desc: "Manage your returns/exchange policies and rules", href: "/admin/settings/policies" },
  { icon: "📍", title: "Locations", desc: "Setup the locations where you want to receive returned/exchanged products", href: "/admin/settings/locations" },
  { icon: "🚚", title: "Logistics", desc: "Manage your logistic integrations", href: "/admin/settings/logistics" },
  { icon: "📝", title: "Reasons", desc: "View and update allowed reasons and refund options for returns/exchange", href: "/admin/settings/reasons" },
  { icon: "💳", title: "Billing", desc: "Manage plans and track your usage details", href: "/admin/settings/billing" },
  { icon: "👥", title: "Users", desc: "Manage users and control what they can access", href: "/admin/settings/users" },
  { icon: "🔔", title: "Notifications", desc: "Manage notifications sent to you and your customers", href: "/admin/settings/notifications" },
  { icon: "🔗", title: "Integrations", desc: "Connect with other apps and systems", href: "/admin/settings/integrations" },
  { icon: "🤖", title: "Automation", desc: "Create rules to automatically perform actions based on set conditions", href: "/admin/settings/automation" },
  { icon: "💰", title: "Payments", desc: "Manage payment partner integrations for refunds", href: "/admin/settings/payments" },
  { icon: "🏪", title: "Stores", desc: "Manage all your other stores from a single dashboard", href: "/admin/settings/stores" },
  { icon: "🎨", title: "Portal Branding", desc: "Customize your customer return portal look and feel", href: "/admin/settings/branding" },
];

export default function AdminSettings() {
  useLoaderData<typeof loader>();

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Settings</h1>
      </div>

      <div className="admin-card">
        <div className="settings-grid">
          {SETTINGS_CARDS.map((card) => (
            <a key={card.title} href={card.href} className="settings-card-link">
              <div className="settings-card-icon">{card.icon}</div>
              <div>
                <div className="settings-card-title">{card.title}</div>
                <div className="settings-card-desc">{card.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
