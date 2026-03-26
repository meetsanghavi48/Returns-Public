import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

const PERMISSION_CATEGORIES: Record<string, string[]> = {
  "Home": ["View dashboard"],
  "Request": [
    "View requests", "Create requests", "Approve requests", "Reject requests",
    "Mark as received", "Process refund", "Schedule pickup", "Cancel pickup",
    "Add notes", "Edit request", "Archive request", "Delete request",
  ],
  "Customer": ["View customer data", "Edit customer info", "View order history", "Export customer data", "Delete customer"],
  "Export": ["Export data"],
  "Analytics": ["View analytics"],
  "Settings": [
    "General settings", "Languages", "Policies", "Locations", "Logistics",
    "Reasons", "Billing", "Users", "Notifications", "Integrations",
    "Automation", "Payments", "WMS",
  ],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const locations = await prisma.location.findMany({ where: { shop }, select: { id: true, name: true } });
  return json({ locations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const email = (formData.get("email") as string || "").trim().toLowerCase();
    const name = (formData.get("name") as string || "").trim();
    const phone = (formData.get("phone") as string || "").trim() || null;
    const designation = (formData.get("designation") as string || "").trim() || null;

    if (!email || !name) return json({ error: "Name and email are required" }, { status: 400 });

    let permissions: Record<string, boolean> = {};
    try { permissions = JSON.parse(formData.get("permissions") as string || "{}"); } catch { /* ignore */ }
    let locationIds: string[] = [];
    try { locationIds = JSON.parse(formData.get("locations") as string || "[]"); } catch { /* ignore */ }

    // Check limits — ensure billing record exists
    const usage = await prisma.billingUsage.upsert({
      where: { shop },
      update: {},
      create: { shop, usersUsed: 1, usersLimit: 1, billingCycleEnd: new Date(Date.now() + 30 * 86400000) },
    });
    const currentCount = await prisma.appUser.count({ where: { shop } });
    if (currentCount >= usage.usersLimit) {
      return json({ error: `User limit reached (${usage.usersLimit}). Upgrade your plan to add more users.` }, { status: 400 });
    }

    // Check duplicate
    const existing = await prisma.appUser.findFirst({ where: { shop, email } });
    if (existing) return json({ error: "User with this email already exists" }, { status: 400 });

    // Generate invite token
    const { randomUUID } = await import("crypto");
    const inviteToken = randomUUID();

    await prisma.appUser.create({
      data: {
        shop, email, name, phone, designation,
        role: "viewer",
        permissions,
        locations: locationIds,
        inviteToken,
      },
    });

    // Update billing
    const newCount = currentCount + 1;
    await prisma.billingUsage.upsert({
      where: { shop },
      update: { usersUsed: newCount },
      create: { shop, usersUsed: newCount, billingCycleEnd: new Date(Date.now() + 30 * 86400000) },
    });

    // Send invitation email
    try {
      const { sendNotification } = await import("../services/email-templates.server");
      const appUrl = process.env.SHOPIFY_APP_URL || "";
      await sendNotification(shop, "user_invite", null, {
        customer_name: name,
        customer_email: email,
        invite_url: `${appUrl}/accept-invite/${inviteToken}`,
        shop_name: shop,
      });
    } catch (e) {
      // Silently fail — user is still created
    }
    return redirect("/app/settings/users");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function CreateUser() {
  const { locations } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [form, setForm] = useState({ name: "", email: "", phone: "", designation: "" });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const u = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const togglePermission = useCallback((perm: string) => {
    setPermissions((prev) => ({ ...prev, [perm]: !prev[perm] }));
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }, []);

  const selectAllPerms = useCallback(() => {
    const allPerms: Record<string, boolean> = {};
    for (const perms of Object.values(PERMISSION_CATEGORIES)) {
      for (const p of perms) allPerms[p] = true;
    }
    setPermissions(allPerms);
  }, []);

  const toggleLocation = useCallback((locId: string) => {
    setSelectedLocations((prev) =>
      prev.includes(locId) ? prev.filter((l) => l !== locId) : [...prev, locId]
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name || !form.email) return;
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("name", form.name);
    fd.set("email", form.email);
    fd.set("phone", form.phone);
    fd.set("designation", form.designation);
    fd.set("permissions", JSON.stringify(permissions));
    fd.set("locations", JSON.stringify(selectedLocations));
    submit(fd, { method: "post" });
  }, [form, permissions, selectedLocations, submit]);

  const totalPerms = Object.values(PERMISSION_CATEGORIES).flat().length;
  const selectedPerms = Object.values(permissions).filter(Boolean).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/app/settings/users" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Users</Link>
          <h1 style={{ margin: "4px 0 0" }}>You are adding a new user</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={!form.name || !form.email || isLoading}>
          {isLoading ? "Creating..." : "Create User"}
        </button>
      </div>

      {actionData?.error && (
        <div className="admin-banner" style={{ background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {actionData.error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <div>
          <div className="admin-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Users</h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
              Give users access to your store by sending them an invitation.
            </p>
          </div>
        </div>

        <div>
          {/* User details */}
          <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Name *</label>
                <input className="admin-input" value={form.name} onChange={(e) => u("name", e.target.value)} placeholder="What do you call this user?" maxLength={60} style={{ width: "100%" }} />
                <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>{form.name.length}/60</div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Email *</label>
                <input className="admin-input" value={form.email} onChange={(e) => u("email", e.target.value)} placeholder="What's their email?" type="email" style={{ width: "100%" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Phone</label>
                <input className="admin-input" value={form.phone} onChange={(e) => u("phone", e.target.value)} placeholder="What's their phone?" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Designation</label>
                <input className="admin-input" value={form.designation} onChange={(e) => u("designation", e.target.value)} placeholder="What's their designation?" style={{ width: "100%" }} />
              </div>
            </div>

            {/* Locations */}
            {locations.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Locations</label>
                <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>User will be able to choose from all locations while creating any new request from dashboard.</p>
                {locations.map((loc: any) => (
                  <label key={loc.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 13 }}>
                    <input type="checkbox" checked={selectedLocations.includes(loc.id)} onChange={() => toggleLocation(loc.id)} />
                    {loc.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Permissions */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={selectedPerms === totalPerms} onChange={selectAllPerms} />
                  <span style={{ fontWeight: 600 }}>Select all permissions</span>
                </label>
                <span style={{ fontSize: 12, color: "#888" }}>({selectedPerms}/{totalPerms})</span>
              </div>
              <button onClick={() => setExpandedCategories(new Set(Object.keys(PERMISSION_CATEGORIES)))} style={{ background: "none", border: "none", color: "var(--admin-accent)", fontSize: 13, cursor: "pointer" }}>
                Expand All
              </button>
            </div>

            {Object.entries(PERMISSION_CATEGORIES).map(([category, perms]) => {
              const catSelected = perms.filter((p) => permissions[p]).length;
              const isExpanded = expandedCategories.has(category);
              return (
                <div key={category} style={{ borderBottom: "1px solid #f0f0f0", marginBottom: 8 }}>
                  <button
                    onClick={() => toggleCategory(category)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{category}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {catSelected}/{perms.length} {isExpanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ paddingLeft: 16, paddingBottom: 12 }}>
                      {perms.map((perm) => (
                        <label key={perm} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
                          <input type="checkbox" checked={!!permissions[perm]} onChange={() => togglePermission(perm)} />
                          {perm}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
