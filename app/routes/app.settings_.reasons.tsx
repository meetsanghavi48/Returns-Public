import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { getSetting, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const reasons = await prisma.returnReason.findMany({
    where: { shop },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  // Load global refund mode settings
  const refundSettings = {
    prepaidStoreCredit: await getSetting<boolean>(shop, "refund_prepaid_store_credit", true),
    prepaidOriginal: await getSetting<boolean>(shop, "refund_prepaid_original", true),
    codStoreCredit: await getSetting<boolean>(shop, "refund_cod_store_credit", true),
    codBankTransfer: await getSetting<boolean>(shop, "refund_cod_bank_transfer", false),
    codOther: await getSetting<boolean>(shop, "refund_cod_other", false),
  };

  // Load global return methods & region settings
  const methodSettings = {
    sendLabel: await getSetting<boolean>(shop, "method_send_label", false),
    shipBack: await getSetting<boolean>(shop, "method_ship_back", false),
    returnAtStore: await getSetting<boolean>(shop, "method_return_at_store", false),
    region: await getSetting<string>(shop, "return_region", "all"),
  };

  return json({ reasons, refundSettings, methodSettings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
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

  if (intent === "save_refund_modes") {
    await setSetting(shop, "refund_prepaid_store_credit", formData.get("prepaidStoreCredit") === "true");
    await setSetting(shop, "refund_prepaid_original", formData.get("prepaidOriginal") === "true");
    await setSetting(shop, "refund_cod_store_credit", formData.get("codStoreCredit") === "true");
    await setSetting(shop, "refund_cod_bank_transfer", formData.get("codBankTransfer") === "true");
    await setSetting(shop, "refund_cod_other", formData.get("codOther") === "true");
    return json({ ok: true, saved: "refund" });
  }

  if (intent === "save_methods") {
    await setSetting(shop, "method_send_label", formData.get("sendLabel") === "true");
    await setSetting(shop, "method_ship_back", formData.get("shipBack") === "true");
    await setSetting(shop, "method_return_at_store", formData.get("returnAtStore") === "true");
    await setSetting(shop, "return_region", formData.get("region") as string || "all");
    return json({ ok: true, saved: "methods" });
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
  photoRequired: false,
  noteRequired: false,
  methodSendLabel: false,
  methodShipBack: false,
  methodReturnAtStore: false,
  region: "all",
};

export default function SettingsReasons() {
  const { reasons, refundSettings, methodSettings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [showModal, setShowModal] = useState(false);
  const [editingReason, setEditingReason] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_REASON);

  // Global refund mode state
  const [refundModes, setRefundModes] = useState(refundSettings);
  const [refundSaved, setRefundSaved] = useState(false);

  // Global return methods & region state
  const [methods, setMethods] = useState(methodSettings);
  const [methodsSaved, setMethodsSaved] = useState(false);

  const openAdd = () => {
    setEditingReason(null);
    setForm({ ...EMPTY_REASON });
    setShowModal(true);
  };

  const openEdit = (reason: any) => {
    setEditingReason(reason);
    setForm({
      id: reason.id,
      name: reason.name,
      applicableFor: reason.applicableFor,
      appliesTo: reason.appliesTo,
      message: reason.message || "",
      mandatoryOptin: reason.mandatoryOptin,
      photoRequired: reason.photoRequired,
      noteRequired: reason.noteRequired,
      methodSendLabel: reason.methodSendLabel,
      methodShipBack: reason.methodShipBack,
      methodReturnAtStore: reason.methodReturnAtStore,
      region: reason.region,
    });
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

  const handleSaveRefundModes = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save_refund_modes");
    fd.set("prepaidStoreCredit", String(refundModes.prepaidStoreCredit));
    fd.set("prepaidOriginal", String(refundModes.prepaidOriginal));
    fd.set("codStoreCredit", String(refundModes.codStoreCredit));
    fd.set("codBankTransfer", String(refundModes.codBankTransfer));
    fd.set("codOther", String(refundModes.codOther));
    submit(fd, { method: "post" });
    setRefundSaved(true);
    setTimeout(() => setRefundSaved(false), 3000);
  }, [refundModes, submit]);

  const handleSaveMethods = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save_methods");
    fd.set("sendLabel", String(methods.sendLabel));
    fd.set("shipBack", String(methods.shipBack));
    fd.set("returnAtStore", String(methods.returnAtStore));
    fd.set("region", methods.region);
    submit(fd, { method: "post" });
    setMethodsSaved(true);
    setTimeout(() => setMethodsSaved(false), 3000);
  }, [methods, submit]);

  const u = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }));
  const ur = (key: string, val: boolean) => setRefundModes((p: any) => ({ ...p, [key]: val }));
  const um = (key: string, val: any) => setMethods((p: any) => ({ ...p, [key]: val }));

  const returnReasons = reasons.filter((r: any) => r.applicableFor === "return" || r.applicableFor === "both");
  const exchangeReasons = reasons.filter((r: any) => r.applicableFor === "exchange" || r.applicableFor === "both");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Return and exchange reasons</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openAdd}>Add reason</button>
      </div>

      {/* Info banner */}
      <div className="admin-card" style={{ background: "#EFF6FF", borderLeft: "4px solid var(--admin-accent)", marginBottom: 24 }}>
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
                    <button className="admin-btn admin-btn-sm" onClick={() => openEdit(r)} title="Edit" style={{ marginRight: 4 }}>&#9998;</button>
                    <button className="admin-btn admin-btn-sm" onClick={() => {
                      const clone = { ...EMPTY_REASON, name: r.name, applicableFor: r.applicableFor, appliesTo: r.appliesTo, message: r.message || "", region: r.region, photoRequired: r.photoRequired, noteRequired: r.noteRequired };
                      setEditingReason(null);
                      setForm(clone);
                      setShowModal(true);
                    }} title="Duplicate" style={{ marginRight: 4 }}>&#128203;</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(r.id)} title="Delete">&#128465;</button>
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
                    <button className="admin-btn admin-btn-sm" onClick={() => openEdit(r)} title="Edit" style={{ marginRight: 4 }}>&#9998;</button>
                    <button className="admin-btn admin-btn-sm" onClick={() => {
                      const clone = { ...EMPTY_REASON, name: r.name, applicableFor: r.applicableFor, appliesTo: r.appliesTo, message: r.message || "", region: r.region, photoRequired: r.photoRequired, noteRequired: r.noteRequired };
                      setEditingReason(null);
                      setForm(clone);
                      setShowModal(true);
                    }} title="Duplicate" style={{ marginRight: 4 }}>&#128203;</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(r.id)} title="Delete">&#128465;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Global Refund Modes Section ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 32 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Refund modes</h3>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            Configure which refund options your customers see based on how they paid for their order.
            COD = Cash on Delivery / payment pending orders.
          </p>
        </div>
        <div className="admin-card" style={{ padding: 24 }}>
          {refundSaved && (
            <div style={{ background: "#ECFDF5", borderLeft: "4px solid var(--admin-success)", borderRadius: 6, padding: 10, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: "#065f46", margin: 0 }}>Refund mode settings saved.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            {/* Prepaid / Online paid orders */}
            <div>
              <h4 style={{ fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>&#128179;</span>
                Refund modes for Prepaid/Online orders
              </h4>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>These options will be shown to customers who paid online (card, UPI, net banking, etc.)</p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={refundModes.prepaidStoreCredit} onChange={(e) => ur("prepaidStoreCredit", e.target.checked)} />
                Store credit (Via Discount code/Gift card)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={refundModes.prepaidOriginal} onChange={(e) => ur("prepaidOriginal", e.target.checked)} />
                Original payment mode
              </label>
            </div>

            {/* COD / Manual / Payment pending orders */}
            <div>
              <h4 style={{ fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>&#127974;</span>
                Refund modes for COD/Manual orders
              </h4>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>These options will be shown to customers with Cash on Delivery or payment pending orders.</p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={refundModes.codStoreCredit} onChange={(e) => ur("codStoreCredit", e.target.checked)} />
                Store credit (Via Discount code/Gift card)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={refundModes.codBankTransfer} onChange={(e) => ur("codBankTransfer", e.target.checked)} />
                Bank transfer
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={refundModes.codOther} onChange={(e) => ur("codOther", e.target.checked)} />
                Others
              </label>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #eee", marginTop: 20, paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="admin-btn admin-btn-primary" onClick={handleSaveRefundModes} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save refund modes"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Global Return Methods Section ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 32 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Return methods</h3>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            Configure which return methods your customers can use when submitting a return request.
          </p>
        </div>
        <div className="admin-card" style={{ padding: 24 }}>
          {methodsSaved && (
            <div style={{ background: "#ECFDF5", borderLeft: "4px solid var(--admin-success)", borderRadius: 6, padding: 10, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: "#065f46", margin: 0 }}>Return methods saved.</p>
            </div>
          )}

          <h4 style={{ fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>&#128260;</span>
            What return methods to show customers?
          </h4>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={methods.sendLabel} onChange={(e) => um("sendLabel", e.target.checked)} />
            Send a return label (You will send a label to the customer)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={methods.shipBack} onChange={(e) => um("shipBack", e.target.checked)} />
            Ship back myself (Customer will send it back on their own)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" checked={methods.returnAtStore} onChange={(e) => um("returnAtStore", e.target.checked)} />
            Return at store (Customer will return at any of the stores)
          </label>

          <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "0 0 16px" }} />

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Region (leave "all" for all regions)</label>
            <input className="admin-input" value={methods.region} onChange={(e) => um("region", e.target.value)} placeholder="all, or comma-separated: US, IN, GB" style={{ width: "100%", maxWidth: 400 }} />
            <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Restrict returns to specific regions. Customers outside these regions will not be able to submit returns.</p>
          </div>

          <div style={{ borderTop: "1px solid #eee", marginTop: 20, paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="admin-btn admin-btn-primary" onClick={handleSaveMethods} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save return methods"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom save buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--admin-border)", gap: 8 }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSaveRefundModes} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save refund modes"}
        </button>
        <button className="admin-btn admin-btn-primary" onClick={handleSaveMethods} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save return methods"}
        </button>
      </div>

      {/* ═══ Add/Edit Reason Modal ═══ */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(700px, 95vw)", maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingReason ? "Edit Reason" : "Add Reason"}</h2>
                <p style={{ fontSize: 13, color: "#666", margin: 0 }}>This reason will be shown to customers from <strong>{form.region === "all" ? "all regions" : form.region}</strong></p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>&times;</button>
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
                        borderColor: form.applicableFor === opt.val ? "var(--admin-accent)" : "#ddd",
                        background: form.applicableFor === opt.val ? "#EFF6FF" : "#fff",
                        cursor: "pointer", fontWeight: 500, fontSize: 13,
                      }}
                    >
                      {form.applicableFor === opt.val && "\u2713 "}{opt.label}
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

            {/* Requirements */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
              <div>
                <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>&#128247;</span>
                  Photos/Videos required?
                </h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => u("photoRequired", true)}
                    style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: form.photoRequired ? "var(--admin-accent)" : "#ddd", background: form.photoRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                    Yes
                  </button>
                  <button type="button" onClick={() => u("photoRequired", false)}
                    style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: !form.photoRequired ? "var(--admin-accent)" : "#ddd", background: !form.photoRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                    No
                  </button>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "#EFF6FF", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>&#9998;</span>
                  Note description required?
                </h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => u("noteRequired", true)}
                    style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: form.noteRequired ? "var(--admin-accent)" : "#ddd", background: form.noteRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                    Yes
                  </button>
                  <button type="button" onClick={() => u("noteRequired", false)}
                    style={{ padding: "6px 20px", borderRadius: 6, border: "2px solid", borderColor: !form.noteRequired ? "var(--admin-accent)" : "#ddd", background: !form.noteRequired ? "#EFF6FF" : "#fff", cursor: "pointer", fontSize: 13 }}>
                    No
                  </button>
                </div>
              </div>
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
