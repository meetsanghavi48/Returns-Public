import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { seedNotificationTemplates } from "../services/email-templates.server";

const RETURN_EVENTS = [
  { key: "return_raised", label: "Return Request Raised", desc: "Sent automatically to the customer when their return is raised." },
  { key: "return_approved", label: "Return Request Approved", desc: "Sent automatically to the customer when their return is approved." },
  { key: "return_rejected", label: "Return Request Rejected", desc: "Sent automatically to the customer when their return is rejected." },
  { key: "return_received", label: "Return Item Received", desc: "Sent automatically to the customer when their product is received, as approved." },
  { key: "return_qc_passed", label: "Return Request Re-Approved (QC passed)", desc: "Sent automatically to the customer when their return is approved/approved." },
  { key: "return_cancelled", label: "Return Request Cancelled", desc: "Sent automatically to the customer when their return is cancelled." },
  { key: "return_reinitiated", label: "Return Request Re-Initiated", desc: "Sent automatically to the customer when their refund is initiated." },
];

const EXCHANGE_EVENTS = [
  { key: "exchange_raised", label: "Exchange Request Raised", desc: "Sent when exchange request is raised." },
  { key: "exchange_approved", label: "Exchange Request Approved", desc: "Sent when exchange request is approved." },
  { key: "exchange_rejected", label: "Exchange Request Rejected", desc: "Sent when exchange request is rejected." },
  { key: "exchange_received", label: "Exchange Item Received", desc: "Sent when exchange item is received." },
  { key: "exchange_initiated", label: "Exchange Initiated", desc: "Sent when exchange is initiated." },
  { key: "exchange_qc_passed", label: "Exchange Re-Approved", desc: "Sent when exchange passes QC." },
  { key: "exchange_cancelled", label: "Exchange Request Cancelled", desc: "Sent when exchange is cancelled." },
  { key: "exchange_reinitiated", label: "Exchange Re-Initiated", desc: "Sent when exchange is re-initiated." },
];

const REFUND_EVENTS = [
  { key: "refund_discount_code", label: "Refund issued via discount code", desc: "Sent when refund is issued as discount code." },
  { key: "refund_bank_transfer", label: "Refund issued via bank transfer", desc: "Sent when refund is via bank transfer." },
  { key: "refund_credit_note", label: "Refund issued via credit note", desc: "Sent when refund is issued as credit note." },
  { key: "refund_original", label: "Refund issued via Original Payment Mode", desc: "Sent when refund is to original payment." },
  { key: "refund_completed", label: "Refund Completed", desc: "Sent when refund is fully completed." },
];

const OTHER_EVENTS = [
  { key: "dashboard_return", label: "Return request raised from dashboard", desc: "Sent for dashboard-created returns." },
  { key: "dashboard_exchange", label: "Exchange request raised from dashboard", desc: "Sent for dashboard-created exchanges." },
  { key: "return_in_exchange", label: "Return request in exchange request", desc: "Sent for combined return-in-exchange." },
  { key: "return_to_exchange", label: "Return to Exchange (Converted)", desc: "Sent when return is converted to exchange." },
  { key: "otp", label: "Live OTP", desc: "Sent for OTP verification on portal." },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);

  // Seed defaults if needed
  await seedNotificationTemplates(shop);

  const notifications = await prisma.emailNotification.findMany({
    where: { shop },
    select: { id: true, eventKey: true, isEnabled: true, subject: true, senderName: true, senderEmail: true },
  });

  const emailsSent = await prisma.emailLog.count({ where: { shop } });

  // Get sender details from settings
  const senderSetting = await prisma.settings.findUnique({ where: { shop_key: { shop, key: "sender_name" } } });
  const emailSetting = await prisma.settings.findUnique({ where: { shop_key: { shop, key: "sender_email" } } });
  const senderName = (senderSetting?.value as string) || "Returns Manager";
  const senderEmail = (emailSetting?.value as string) || "";

  return json({ notifications, emailsSent, senderName, senderEmail });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggle") {
    const id = formData.get("id") as string;
    const notif = await prisma.emailNotification.findUnique({ where: { id } });
    if (notif) {
      await prisma.emailNotification.update({ where: { id }, data: { isEnabled: !notif.isEnabled } });
    }
    return json({ ok: true });
  }

  if (intent === "save_sender") {
    const name = formData.get("senderName") as string;
    const email = formData.get("senderEmail") as string;
    await prisma.settings.upsert({ where: { shop_key: { shop, key: "sender_name" } }, update: { value: name as any }, create: { shop, key: "sender_name", value: name as any } });
    await prisma.settings.upsert({ where: { shop_key: { shop, key: "sender_email" } }, update: { value: email as any }, create: { shop, key: "sender_email", value: email as any } });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function NotificationTable({ title, subtitle, events, notifications, onToggle }: {
  title: string; subtitle?: string; events: { key: string; label: string; desc: string }[];
  notifications: any[]; onToggle: (id: string) => void;
}) {
  const notifMap = new Map(notifications.map((n) => [n.eventKey, n]));

  return (
    <div className="admin-card" style={{ marginBottom: 24 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: "1px solid #eee", fontSize: 12, color: "#888" }}>Event</th>
            <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: "1px solid #eee", fontSize: 12, color: "#888" }}>Description</th>
            <th style={{ textAlign: "center", padding: "10px 16px", borderBottom: "1px solid #eee", fontSize: 12, color: "#888", width: 100 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const notif = notifMap.get(event.key);
            const isEnabled = notif?.isEnabled ?? true;
            return (
              <tr key={event.key} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "12px 16px", fontWeight: 500, fontSize: 13 }}>{event.label}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#888" }}>{event.desc}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
                    <button
                      onClick={() => notif && onToggle(notif.id)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                        background: isEnabled ? "var(--admin-success)" : "#ccc", position: "relative", transition: "background 0.2s",
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        position: "absolute", top: 2, left: isEnabled ? 20 : 2, transition: "left 0.2s",
                      }} />
                    </button>
                    {notif && (
                      <Link to={`/admin/settings/notifications/${event.key}`} className="admin-btn admin-btn-sm" title="Edit">&#9998;</Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsNotifications() {
  const { notifications, emailsSent, senderName, senderEmail } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [showSenderModal, setShowSenderModal] = useState(false);
  const [editName, setEditName] = useState(senderName);
  const [editEmail, setEditEmail] = useState(senderEmail);

  const handleToggle = useCallback((id: string) => {
    const fd = new FormData();
    fd.set("intent", "toggle");
    fd.set("id", id);
    submit(fd, { method: "post" });
  }, [submit]);

  const handleSaveSender = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save_sender");
    fd.set("senderName", editName);
    fd.set("senderEmail", editEmail);
    submit(fd, { method: "post" });
    setShowSenderModal(false);
  }, [editName, editEmail, submit]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Email Notifications</h1>
        </div>
      </div>

      {/* Pro banner */}
      <div className="admin-card" style={{ background: "#EFF6FF", borderLeft: "4px solid var(--admin-accent)", marginBottom: 24, padding: 16 }}>
        <p style={{ fontSize: 13, color: "#1e40af", margin: 0 }}>
          Do you want professionals to design a branded HTML email template using your brand guidelines and instructions?
          Service starts at just $10 per template.
        </p>
      </div>

      {/* Sender details */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Sender Details</h3>
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>All notifications will be from this email and the provided name and email.</p>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--admin-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 20 }}>
              {senderName.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{senderName}</div>
              <div style={{ fontSize: 13, color: "#888" }}>{senderEmail || "Not configured"}</div>
            </div>
          </div>
          <button className="admin-btn admin-btn-sm" onClick={() => setShowSenderModal(true)}>&#9998; Edit</button>
        </div>
      </div>

      {/* Email count */}
      <div className="admin-card" style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>&#9993;</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{emailsSent} emails sent</span>
        </div>
      </div>

      <NotificationTable title="Return Notifications" subtitle="All notifications for every stage of a return request. Click on pencil icon to edit the content." events={RETURN_EVENTS} notifications={notifications} onToggle={handleToggle} />
      <NotificationTable title="Exchange Notifications" events={EXCHANGE_EVENTS} notifications={notifications} onToggle={handleToggle} />
      <NotificationTable title="Refund Notifications" subtitle="Manage notifications for refund processed. Click on the pencil icon to edit the content." events={REFUND_EVENTS} notifications={notifications} onToggle={handleToggle} />
      <NotificationTable title="Other Notifications" subtitle="These notifications are automatically sent to the customer via notifications of every new activity." events={OTHER_EVENTS} notifications={notifications} onToggle={handleToggle} />

      {/* Bottom save */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSaveSender} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Sender Modal */}
      {showSenderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(480px, 95vw)", padding: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>You are making changes to sender details</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Sender Name</label>
              <input className="admin-input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: "100%" }} />
              <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Your customers will receive all emails from this name.</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Sender Email</label>
              <input className="admin-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" style={{ width: "100%" }} />
              <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Your customers will receive emails from this address. Their replies will also come to the same email.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="admin-btn" onClick={() => setShowSenderModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSaveSender} disabled={isLoading}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
