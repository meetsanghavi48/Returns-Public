import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

const VARIABLES = [
  "customer_name", "customer_email", "order_number", "request_id",
  "store_name", "portal_url", "tracking_url", "awb_number",
  "refund_amount", "refund_method", "items_list", "reason",
  "rejection_reason", "exchange_items", "otp_code",
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const eventKey = params.eventKey!;

  const template = await prisma.emailNotification.findUnique({
    where: { shop_eventKey: { shop, eventKey } },
  });

  if (!template) throw new Response("Template not found", { status: 404 });

  return json({ template, eventKey });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const eventKey = params.eventKey!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save") {
    const subject = formData.get("subject") as string;
    const htmlBody = formData.get("htmlBody") as string;
    await prisma.emailNotification.update({
      where: { shop_eventKey: { shop, eventKey } },
      data: { subject, htmlBody },
    });
    return json({ ok: true, message: "Template saved" });
  }

  if (intent === "toggle") {
    const template = await prisma.emailNotification.findUnique({ where: { shop_eventKey: { shop, eventKey } } });
    if (template) {
      await prisma.emailNotification.update({
        where: { shop_eventKey: { shop, eventKey } },
        data: { isEnabled: !template.isEnabled },
      });
    }
    return json({ ok: true });
  }

  if (intent === "send_test") {
    const testEmail = formData.get("testEmail") as string;
    const subject = formData.get("subject") as string;
    const htmlBody = formData.get("htmlBody") as string;

    // Replace variables with sample data
    const sampleVars: Record<string, string> = {
      customer_name: "John Doe", customer_email: testEmail, order_number: "#1001",
      request_id: "RET-001", store_name: "My Store", portal_url: "#",
      tracking_url: "#", awb_number: "AWB123456", refund_amount: "500",
      refund_method: "Original Payment", items_list: "Product A x1",
      reason: "Size too small", rejection_reason: "Outside return window",
      exchange_items: "Product B (M)", otp_code: "123456",
    };

    let rendered = htmlBody;
    let renderedSubject = subject;
    for (const [key, val] of Object.entries(sampleVars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      rendered = rendered.replace(pattern, val);
      renderedSubject = renderedSubject.replace(pattern, val);
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return json({ error: "SENDGRID_API_KEY not configured" }, { status: 400 });

    try {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: testEmail }] }],
          from: { email: process.env.SENDER_EMAIL || "noreply@returnsmanager.app", name: "Returns Manager" },
          subject: `[TEST] ${renderedSubject}`,
          content: [{ type: "text/html", value: rendered }],
        }),
      });
      return json({ ok: true, message: "Test email sent!" });
    } catch {
      return json({ error: "Failed to send test email" }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function EditNotification() {
  const { template, eventKey } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [subject, setSubject] = useState(template.subject);
  const [htmlBody, setHtmlBody] = useState(template.htmlBody);
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("subject", subject);
    fd.set("htmlBody", htmlBody);
    submit(fd, { method: "post" });
  }, [subject, htmlBody, submit]);

  const handleToggle = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "toggle");
    submit(fd, { method: "post" });
  }, [submit]);

  const handleSendTest = useCallback(() => {
    if (!testEmail) return;
    const fd = new FormData();
    fd.set("intent", "send_test");
    fd.set("testEmail", testEmail);
    fd.set("subject", subject);
    fd.set("htmlBody", htmlBody);
    submit(fd, { method: "post" });
  }, [testEmail, subject, htmlBody, submit]);

  const insertVariable = useCallback((varName: string) => {
    setHtmlBody((prev) => prev + `{{${varName}}}`);
  }, []);

  // Render preview with sample data
  const previewHtml = htmlBody
    .replace(/\{\{customer_name\}\}/g, "John Doe")
    .replace(/\{\{order_number\}\}/g, "#1001")
    .replace(/\{\{request_id\}\}/g, "RET-001")
    .replace(/\{\{store_name\}\}/g, "My Store")
    .replace(/\{\{refund_amount\}\}/g, "500")
    .replace(/\{\{refund_method\}\}/g, "Original Payment")
    .replace(/\{\{awb_number\}\}/g, "AWB123456")
    .replace(/\{\{items_list\}\}/g, "Product A x1")
    .replace(/\{\{reason\}\}/g, "Size too small")
    .replace(/\{\{rejection_reason\}\}/g, "Outside return window")
    .replace(/\{\{[^}]+\}\}/g, "[sample]");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings/notifications" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Notifications</Link>
          <h1 style={{ margin: "4px 0 0" }}>Edit: {eventKey.replace(/_/g, " ")}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn" onClick={handleToggle}>
            {template.isEnabled ? "Disable" : "Enable"}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
        <div>
          {/* Subject */}
          <div className="admin-card" style={{ marginBottom: 16, padding: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Subject line</label>
            <input className="admin-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%" }} />
          </div>

          {/* Body */}
          <div className="admin-card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Email body (HTML)</label>
              <button className="admin-btn admin-btn-sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <iframe
                srcDoc={previewHtml}
                sandbox=""
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, width: "100%", minHeight: 300, background: "#fafafa" }}
                title="Email preview"
              />
            ) : (
              <textarea
                className="admin-input"
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                style={{ width: "100%", minHeight: 300, fontFamily: "monospace", fontSize: 13 }}
              />
            )}
          </div>

          {/* Test email */}
          <div className="admin-card" style={{ padding: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Send test email</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="admin-input" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Enter email address" type="email" style={{ flex: 1 }} />
              <button className="admin-btn admin-btn-primary" onClick={handleSendTest} disabled={!testEmail || isLoading}>
                Send Test
              </button>
            </div>
          </div>
        </div>

        {/* Variable picker */}
        <div className="admin-card" style={{ padding: 16, alignSelf: "start" }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Available Variables</h4>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Click to insert into body.</p>
          {VARIABLES.map((v) => (
            <button
              key={v}
              onClick={() => insertVariable(v)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "6px 8px",
                border: "none", background: "transparent", cursor: "pointer", fontSize: 12,
                fontFamily: "monospace", borderRadius: 4,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#f0f0f0")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {"{{" + v + "}}"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
