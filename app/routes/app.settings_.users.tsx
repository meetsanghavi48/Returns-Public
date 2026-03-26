import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const users = await prisma.appUser.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });
  const usage = await prisma.billingUsage.findUnique({ where: { shop } });
  return json({ users, usersLimit: usage?.usersLimit || 1 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const id = formData.get("id") as string;
    const user = await prisma.appUser.findUnique({ where: { id } });
    if (user && user.role === "owner") return json({ error: "Cannot delete owner" }, { status: 400 });
    await prisma.appUser.delete({ where: { id } });
    // Update billing count
    const count = await prisma.appUser.count({ where: { shop } });
    await prisma.billingUsage.upsert({
      where: { shop },
      update: { usersUsed: count },
      create: { shop, usersUsed: count, billingCycleEnd: new Date(Date.now() + 30 * 86400000) },
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SettingsUsers() {
  const { users, usersLimit } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Remove this user?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", id);
    submit(fd, { method: "post" });
  }, [submit]);

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.charAt(0).toUpperCase();
    return email.charAt(0).toUpperCase();
  };

  const roleColors: Record<string, string> = {
    owner: "var(--admin-accent)",
    admin: "var(--admin-info)",
    viewer: "#888",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Users and permissions</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Manage what users can see or do in your store.</p>
        </div>
        <Link to="/admin/settings/users/new" className="admin-btn admin-btn-primary">+ Add a new user</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <div>
          <div className="admin-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Users</h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
              Give users access to your store by sending them an invitation. Control their permissions for each module.
            </p>
          </div>
        </div>

        <div>
          <div className="admin-card">
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Users ({users.length} of {usersLimit})</h3>
            </div>
            {users.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
                <p>No users added yet. Add your first team member.</p>
              </div>
            ) : (
              users.map((user: any) => (
                <div key={user.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", background: roleColors[user.role] || "#888",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                      fontWeight: 700, fontSize: 16, flexShrink: 0,
                    }}>
                      {getInitials(user.name, user.email)}
                    </div>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 600 }}>{user.name || user.email}</span>
                        <span className={`admin-badge ${user.role === "owner" ? "accent" : user.role === "admin" ? "info" : ""}`} style={{ textTransform: "capitalize" }}>{user.role}</span>
                        {!user.inviteAccepted && user.role !== "owner" && (
                          <span className="admin-badge warning">Pending</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "#888" }}>{user.email}</div>
                    </div>
                  </div>
                  {user.role !== "owner" && (
                    <button
                      className="admin-btn admin-btn-sm admin-btn-danger"
                      onClick={() => handleDelete(user.id)}
                      disabled={isLoading}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
