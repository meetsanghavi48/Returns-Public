import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, NavLink, useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import adminStyles from "../styles/admin.css?url";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const pendingCount = await prisma.returnRequest.count({
    where: { shop, status: "pending" },
  });
  return json({ shop, pendingCount });
};

export default function AdminLayout() {
  const { shop, pendingCount } = useLoaderData<typeof loader>();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <div className="admin-sidebar-logo-icon">R</div>
          <div>
            <div className="admin-sidebar-logo-text">Returns Manager</div>
            <div className="admin-sidebar-logo-sub">Admin Dashboard</div>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <div className="admin-sidebar-section">
            <div className="admin-sidebar-section-title">Overview</div>
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">📊</span>
              Dashboard
            </NavLink>
          </div>

          <div className="admin-sidebar-section">
            <div className="admin-sidebar-section-title">Management</div>
            <NavLink
              to="/admin/returns"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">📋</span>
              Returns
              {pendingCount > 0 && (
                <span className="admin-nav-badge">{pendingCount}</span>
              )}
            </NavLink>
          </div>

          <div className="admin-sidebar-section">
            <div className="admin-sidebar-section-title">Configuration</div>
            <NavLink
              to="/admin/settings"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">⚙️</span>
              Settings
            </NavLink>
            <NavLink
              to="/admin/audit"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">📜</span>
              Audit Log
            </NavLink>
          </div>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-shop">
            <div className="admin-sidebar-shop-dot" />
            <div className="admin-sidebar-shop-name">{shop}</div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
