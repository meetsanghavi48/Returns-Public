import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

const LOCATION_TYPES = ["Warehouse", "Store", "Distribution Center", "Returns Center", "Office"];

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Spain", "Italy", "Netherlands", "Japan", "South Korea", "China", "Brazil", "Mexico",
  "Singapore", "UAE", "Saudi Arabia", "South Africa", "New Zealand",
];

const EMPTY_LOCATION = {
  id: "", name: "", addressLine1: "", addressLine2: "", city: "", state: "", country: "India",
  pincode: "", phone: "", longitude: "", latitude: "", locationId: "", facilityCode: "",
  locationType: "Warehouse", isDefault: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const locations = await prisma.location.findMany({
    where: { shop },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return json({ locations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create" || intent === "update") {
    const id = formData.get("id") as string | null;
    const isDefault = formData.get("isDefault") === "true";
    const data = {
      shop,
      name: formData.get("name") as string || "",
      addressLine1: formData.get("addressLine1") as string || "",
      addressLine2: (formData.get("addressLine2") as string) || null,
      city: formData.get("city") as string || "",
      state: (formData.get("state") as string) || null,
      country: formData.get("country") as string || "India",
      pincode: formData.get("pincode") as string || "",
      phone: (formData.get("phone") as string) || null,
      longitude: formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : null,
      latitude: formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : null,
      locationId: (formData.get("locationId") as string) || null,
      facilityCode: (formData.get("facilityCode") as string) || null,
      locationType: formData.get("locationType") as string || "Warehouse",
      isDefault,
    };

    if (isDefault) {
      await prisma.location.updateMany({ where: { shop }, data: { isDefault: false } });
    }

    if (intent === "update" && id) {
      await prisma.location.update({ where: { id }, data });
    } else {
      await prisma.location.create({ data });
    }
    return json({ ok: true });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.location.delete({ where: { id } });
    return json({ ok: true });
  }

  if (intent === "set_default") {
    const id = formData.get("id") as string;
    await prisma.location.updateMany({ where: { shop }, data: { isDefault: false } });
    await prisma.location.update({ where: { id }, data: { isDefault: true } });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SettingsLocations() {
  const { locations } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...EMPTY_LOCATION });

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY_LOCATION }); setShowModal(true); };
  const openEdit = (loc: any) => {
    setEditing(loc);
    setForm({ ...loc, longitude: loc.longitude?.toString() || "", latitude: loc.latitude?.toString() || "" });
    setShowModal(true);
  };

  const u = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }));

  const handleSubmit = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", editing ? "update" : "create");
    if (editing) fd.set("id", editing.id);
    for (const [k, v] of Object.entries(form)) {
      fd.set(k, String(v ?? ""));
    }
    submit(fd, { method: "post" });
    setShowModal(false);
  }, [form, editing, submit]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this location?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", id);
    submit(fd, { method: "post" });
  }, [submit]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Locations</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openAdd}>+ Add a new location</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <div>
          <div className="admin-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>My locations</h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
              Setup the locations where you want to receive returned or exchanged products. The default location will be used for logistics pickups.
            </p>
          </div>
        </div>

        <div>
          {locations.length === 0 ? (
            <div className="admin-card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#128205;</div>
              <p style={{ color: "#666" }}>No locations configured. Add your first location.</p>
            </div>
          ) : (
            locations.map((loc: any) => (
              <div key={loc.id} className="admin-card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, background: "#EFF6FF", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>&#128205;</div>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{loc.name}</span>
                        {loc.isDefault && <span className="admin-badge success">Default</span>}
                        <span className="admin-badge info">{loc.locationType}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>
                        {loc.addressLine1}{loc.addressLine2 ? `, ${loc.addressLine2}` : ""}<br />
                        {loc.city}{loc.state ? `, ${loc.state}` : ""} - {loc.pincode}<br />
                        {loc.country}{loc.phone ? ` | Phone: ${loc.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn admin-btn-sm" onClick={() => openEdit(loc)} title="Edit">&#9998;</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(loc.id)} title="Delete">&#128465;</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(680px, 95vw)", maxHeight: "90vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{editing ? "Edit Location" : "Add Location"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>&times;</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Location name *</label>
                <input className="admin-input" value={form.name} onChange={(e) => u("name", e.target.value)} placeholder="e.g. New York Warehouse" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Type of location</label>
                <select className="admin-input" value={form.locationType} onChange={(e) => u("locationType", e.target.value)} style={{ width: "100%" }}>
                  {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Address line 1 *</label>
              <input className="admin-input" value={form.addressLine1} onChange={(e) => u("addressLine1", e.target.value)} placeholder="Start typing to see suggestions" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Address line 2</label>
              <input className="admin-input" value={form.addressLine2 || ""} onChange={(e) => u("addressLine2", e.target.value)} placeholder="e.g. Berkley Suites" style={{ width: "100%" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>City *</label>
                <input className="admin-input" value={form.city} onChange={(e) => u("city", e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Country/Region</label>
                <select className="admin-input" value={form.country} onChange={(e) => u("country", e.target.value)} style={{ width: "100%" }}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>State/Province</label>
                <input className="admin-input" value={form.state || ""} onChange={(e) => u("state", e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>PIN code *</label>
                <input className="admin-input" value={form.pincode} onChange={(e) => u("pincode", e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Phone</label>
                <input className="admin-input" value={form.phone || ""} onChange={(e) => u("phone", e.target.value)} placeholder="9990099900" style={{ width: "100%" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Longitude</label>
                <input className="admin-input" value={form.longitude} onChange={(e) => u("longitude", e.target.value)} type="number" step="any" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Latitude</label>
                <input className="admin-input" value={form.latitude} onChange={(e) => u("latitude", e.target.value)} type="number" step="any" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Location ID</label>
                <input className="admin-input" value={form.locationId || ""} onChange={(e) => u("locationId", e.target.value)} placeholder="e.g. 999009" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Facility Code</label>
                <input className="admin-input" value={form.facilityCode || ""} onChange={(e) => u("facilityCode", e.target.value)} style={{ width: "100%" }} />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13 }}>
              <input type="checkbox" checked={form.isDefault} onChange={(e) => u("isDefault", e.target.checked)} />
              Set as default address
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="admin-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={!form.name || !form.addressLine1 || !form.city || !form.pincode || isLoading}>
                {isLoading ? "Saving..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
