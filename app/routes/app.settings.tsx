import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAppAuth } from "../services/app-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  return json({ shop });
};

const SETTINGS_CARDS = [
  { icon: "\u2699\uFE0F", title: "General", desc: "View and update your store details", href: "/app/settings/general" },
  { icon: "\uD83D\uDCCB", title: "Policies", desc: "Manage your returns/exchange policies and rules", href: "/app/settings/policies" },
  { icon: "\uD83D\uDCCD", title: "Locations", desc: "Setup the locations where you want to receive returned/exchanged products", href: "/app/settings/locations" },
  { icon: "\uD83D\uDE9A", title: "Logistics", desc: "Manage your logistic integrations", href: "/app/settings/logistics" },
  { icon: "\uD83D\uDCDD", title: "Reasons", desc: "View and update allowed reasons and refund options for returns/exchange", href: "/app/settings/reasons" },
  { icon: "\uD83D\uDCB3", title: "Billing", desc: "Manage plans and track your usage details", href: "/app/settings/billing" },
  { icon: "\uD83D\uDC65", title: "Users", desc: "Manage users and control what they can access", href: "/app/settings/users" },
  { icon: "\uD83D\uDD14", title: "Notifications", desc: "Manage notifications sent to you and your customers", href: "/app/settings/notifications" },
  { icon: "\uD83D\uDD17", title: "Integrations", desc: "Connect chat, mobile, marketing & WMS platforms", href: "/app/settings/integrations" },
  { icon: "\u26A1", title: "Automation", desc: "Create rules to automatically perform actions based on set conditions", href: "/app/settings/automation" },
  { icon: "\uD83D\uDCB0", title: "Payments", desc: "Manage payment partner integrations for refunds", href: "/app/settings/payments" },
  { icon: "\uD83C\uDFE0", title: "Stores", desc: "Manage all your other stores from a single dashboard", href: "/app/settings/stores" },
  { icon: "\uD83C\uDFA8", title: "Portal Branding", desc: "Customize your customer return portal look and feel", href: "/app/settings/branding" },
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
