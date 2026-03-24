import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const reasons = await prisma.returnReason.findMany({
    where: { shop },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return json({ reasons });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create" || intent === "update") {
    const id = formData.get("id") as string | null;
    const data = {
      shop,
      name: formData.get("name") as string || "",
      applicableFor: formData.get("applicableFor") as string || "both",
      appliesTo: formData.get("appliesTo") as string || "all",
      message: formData.get("message") as string || "",
      mandatoryOptin: formData.get("mandatoryOptin") === "true",
      refundPrepaidStoreCredit: formData.get("refundPrepaidStoreCredit") === "true",
      refundPrepaidOriginal: formData.get("refundPrepaidOriginal") === "true",
      refundCodStoreCredit: formData.get("refundCodStoreCredit") === "true",
      refundCodBankTransfer: formData.get("refundCodBankTransfer") === "true",
      refundCodOther: formData.get("refundCodOther") === "true",
      photoRequired: formData.get("photoRequired") === "true",
      noteRequired: formData.get("noteRequired") === "true",
      methodSendLabel: formData.get("methodSendLabel") === "true",
      methodShipBack: formData.get("methodShipBack") === "true",
      methodReturnAtStore: formData.get("methodReturnAtStore") === "true",
      region: formData.get("region") as string || "all",
    };

    if (intent === "update" && id) {
      await prisma.returnReason.update({ where: { id }, data });
    } else {
      await prisma.returnReason.create({ data });
    }
    return json({ ok: true });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.returnReason.delete({ where: { id } });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

const EMPTY_REASON = {
  id: "",
  name: "",
  applicableFor: "both",
  appliesTo: "all",
  message: "",
  mandatoryOptin: false,
  refundPrepaidStoreCredit: true,
  refundPrepaidOriginal: true,
  refundCodStoreCredit: true,
  refundCodBankTransfer: false,
  refundCodOther: false,
  photoRequired: false,
  noteRequired: false,
  methodSendLabel: false,
  methodShipBack: false,
  methodReturnAtStore: false,
  region: "all",
};

export default function SettingsReasons() {
  const { reasons } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [showModal, setShowModal] = useState(false);
  const [editingReason, setEditingReason] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_REASON);

  const openAdd = () => {
    setEditingReason(null);
    setForm({ ...EMPTY_REASON });
    setShowModal(true);
  };

  const openEdit = (reason: any) => {
    setEditingReason(reason);
    setForm({ ...reason });
    setShowModal(true);
  };

  const handleSubmit = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", editingReason ? "update" : "create");
    if (editingReason) fd.set("id", editingReason.id);
    for (const [k, v] of Object.entries(form)) {
      fd.set(k, String(v));
    }
    submit(fd, { method: "post" });
    setShowModal(false);
  }, [form, editingReason, submit]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this reason?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", id);
    submit(fd, { method: "post" });
  }, [submit]);

  const u = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }));

  const returnReasons = reasons.filter((r: any) => r.applicableFor === "return" || r.applicableFor === "both");
  const exchangeReasons = reasons.filter((r: any) => r.applicableFor === "exchange" || r.applicableFor === "both");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-primary)", textDecoration: "none", fontSize: 13 }}>‹ Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Return and exchange reasons</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openAdd}>Add reason</button>
      </div>

      {/* Info banner */}
      <div className="admin-card" style={{ background: "#EFF6FF", borderLeft: "4px solid var(--admin-primary)", marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: "#1e40af" }}>
          You can restrict returns/exchange by creating reasons applicable only for selected countries/province.
          For e.g., if you offer returns only in U.S., create all reasons only for US region and customers from all other regions will not be allowed to return/exchange.
        </p>
      </div>

      {/* Return Reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 32 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Return reasons</h3>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Customers will be able to view and select these reasons while raising a return request.</p>
        </div>
        <div className="admin-card">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 13, color: "#666" }}>Reason name</th><th style={{ width: 120 }}></th></tr>
            </thead>
            <tbody>
              {returnReasons.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 16, textAlign: "center", color: "#999" }}>No return reasons configured. Click "Add reason" to create one.</td></tr>
              )}
              {returnReasons.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>Applicable for <strong>{r.region === "all" ? "all regions" : r.region}</strong></div>
                  </td>
                  <td style={{ textAlign: "right", padding: "12px" }}>
                    <button className="admin-btn admin-btn-sm" onClick={() => openEdit(r)} title="Edit" style={{ marginRight: 4 }}>✏️</button>
                    <button className="admin-btn admin-btn-sm" onClick={() => {
                      const clone = { ...r, id: "" };
                      setEditingReason(null);
                      setForm(clone);
                      setShowModal(true);
                    }} title="Duplicate" style={{ marginRight: 4 }}>📋</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(r.id)} title="Delete">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exchange Reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 32 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Exchange reasons</h3>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Customers will be able to view and select these reasons while raising an exchange request.</p>
        </div>
        <div className="admin-card">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 13, color: "#666" }}>Reason name</th><th style={{ width: 120 }}></th></tr>
            </thead>
            <tbody>
              {exchangeReasons.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 16, textAlign: "center", color: "#999" }}>No exchange reasons configured. Click "Add reason" to create one.</td></tr>
              )}
              {exchangeReasons.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>Applicable for <strong>{r.region === "all" ? "all regions" : r.region}</strong></div>
                  </td>
                  <td style={{ textAlign: "right", padding: "12px" }}>
                    <button className="admin-btn admin-btn-sm" onClick={() => openEdit(r)} title="Edit" style={{ marginRight: 4 }}>✏️</button>
                    <button className="admin-btn admin-btn-sm" onClick={() => {
                      const clone = { ...r, id: "" };
                      setEditingReason(null);
                      setForm(clone);
                      setShowModal(true);
                    }} title="Duplicate" style={{ marginRight: 4 }}>📋</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(r.id)} title="Delete">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(700px, 95vw)", maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingReason ? "Edit Reason" : "Add Reason"}</h2>
                <p style={{ fontSize: 13, color: "#666", margin: 0 }}>This reason will be shown to customers from <strong>{form.region === "all" ? "all regions" : form.region}</strong></p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            {/* Applicable for */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>This reason is applicable for</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { val: "return", label: "Return" },
                    { val: "exchange", label: "Exchange" },
                    { val: "both", label: "Both" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => u("applicableFor", opt.val)}
                      style={{
                        padding: "8px 16px", borderRadius: 8, border: "2px solid",
                        borderColor: form.applicableFor === opt.val ? "var(--admin-primary)" : "#ddd",
                        background: form.applicableFor === opt.val ? "#EFF6FF" : "#fff",
                        cursor: "pointer", fontWeight: 500, fontSize: 13,
                      }}
                    >
                      {form.applicableFor === opt.val && "✓ "}{opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Reason name</label>
                <input className="admin-input" value={form.name} onChange={(e) => u("name", e.target.value)} placeholder="Enter reason name" />
              </div>
            </div>

            {/* Applies to & Message */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Applies for</label>
                <select className="admin-input" value={form.appliesTo} onChange={(e) => u("appliesTo", e.target.value)}>
                  <option value="all">All products</option>
                  <option value="tagged">Tagged products only</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Message to customer</label>
                <textarea
                  className="admin-input"
                  value={form.message}
                  onChange={(e) => u("message", e.target.value)}
                  placeholder="For e.g., A fee of $15 will be deducted from your refund amount for Returns handling"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
                <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>{(form.message || "").length}/800</div>
              </div>
            </div>

            {/* Mandatory opt-in */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13 }}>
              <input type="checkbox" checked={form.mandatoryOptin} onChange={(e) => u("mandatoryOptin", e.target.checked)} />
              Make it mandatory for customers to Opt-in
            </label>

            <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "16px 0" }} />

            {/* Refund modes + Requirements */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
              {/* Left: Refund modes */}
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>💳</span>
                    Refund modes for Prepaid/Online orders
                  </h4>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <input type="checkbox" checked={form.refundPrepaidStoreCredit} onChange={(e) => u("refundPrepaidStoreCredit", e.target.checked)} />
                    Store credit (Via Discount code/Gift card)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={form.refundPrepaidOriginal} onChange={(e) => u("refundPrepaidOriginal", e.target.checked)} />
                    Original payment mode
                  </label>
                </div>

                <div>
                  <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>🏦</span>
                    Refund modes for COD/Manual orders
                  </h4>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <input type="checkbox" checked={form.refundCodStoreCredit} onChange={(e) => u("refundCodStoreCredit", e.target.checked)} />
                    Store credit (Via Discount code/Gift card)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <input type="checkbox" checked={form.refundCodBankTransfer} onChange={(e) => u("refundCodBankTransfer", e.target.checked)} />
                    Bank transfer
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={form.refundCodOther} onChange={(e) => u("refundCodOther", e.target.checked)} />
                    Others
                  </label>
                </div>
              </div>

              {/* Right: Requirements */}
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>📷</span>
                    Photos/Videos required?
                  </h4>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => u("photoRequired", true)}
                      style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: form.photoRequired ? "var(--admin-primary)" : "#ddd", background: form.photoRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                      Yes
                    </button>
                    <button type="button" onClick={() => u("photoRequired", false)}
                      style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: !form.photoRequired ? "var(--admin-primary)" : "#ddd", background: !form.photoRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                      No
                    </button>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</span>
                    Note description required?
                  </h4>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => u("noteRequired", true)}
                      style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: form.noteRequired ? "var(--admin-primary)" : "#ddd", background: form.noteRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                      Yes
                    </button>
                    <button type="button" onClick={() => u("noteRequired", false)}
                      style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: !form.noteRequired ? "var(--admin-primary)" : "#ddd", background: !form.noteRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                      No
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "16px 0" }} />

            {/* Return methods */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>🔄</span>
                What return methods to show customers?
              </h4>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                <input type="checkbox" checked={form.methodSendLabel} onChange={(e) => u("methodSendLabel", e.target.checked)} />
                Send a return label (You will send a label to the customer)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                <input type="checkbox" checked={form.methodShipBack} onChange={(e) => u("methodShipBack", e.target.checked)} />
                Ship back myself (Customer will send it back on their own)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.methodReturnAtStore} onChange={(e) => u("methodReturnAtStore", e.target.checked)} />
                Return at store (Customer will return at any of the stores)
              </label>
            </div>

            {/* Region */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Region (leave "all" for all regions)</label>
              <input className="admin-input" value={form.region} onChange={(e) => u("region", e.target.value)} placeholder="all, or comma-separated: US, IN, GB" />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="admin-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={!form.name || isLoading}>
                {isLoading ? "Saving..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
