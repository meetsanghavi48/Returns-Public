import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, NavLink, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import adminStyles from "../styles/admin.css?url";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const pendingCount = await prisma.returnRequest.count({
    where: { shop, status: "pending" },
  });
  return json({ shop, pendingCount });
};

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.data || "Something went wrong"
    : "An unexpected error occurred. Please try again.";

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <div style={{ background: "#fff", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: 480, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: "#ef4444", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24, color: "#fff" }}>!</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Error {status}</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>{String(message)}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <a href="/admin/dashboard" style={{ display: "inline-block", padding: "10px 24px", background: "#6c5ce7", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Dashboard</a>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", background: "#f3f4f6", color: "#374151", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { shop, pendingCount } = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={enTranslations}>
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
              <span className="admin-nav-icon">{"\uD83C\uDFE0"}</span>
              Home
            </NavLink>
            <NavLink
              to="/admin/returns"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">{"\uD83D\uDCE6"}</span>
              Returns
              {pendingCount > 0 && (
                <span className="admin-nav-badge">{pendingCount}</span>
              )}
            </NavLink>
          </div>

          <div className="admin-sidebar-section">
            <div className="admin-sidebar-section-title">Insights</div>
            <NavLink
              to="/admin/analytics"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">{"\uD83D\uDCCA"}</span>
              Analytics
            </NavLink>
            <NavLink
              to="/admin/export"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">{"\uD83D\uDCE5"}</span>
              Export Data
            </NavLink>
          </div>

          <div className="admin-sidebar-section">
            <div className="admin-sidebar-section-title">Configuration</div>
            <NavLink
              to="/admin/settings"
              end
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">{"\u2699\uFE0F"}</span>
              Settings
            </NavLink>
            <NavLink
              to="/admin/audit"
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="admin-nav-icon">{"\uD83D\uDCDC"}</span>
              Audit Log
            </NavLink>
          </div>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-shop">
            <div className="admin-sidebar-shop-dot" />
            <div className="admin-sidebar-shop-name">{shop}</div>
          </div>
          <a href="/admin/logout" style={{ display: "block", fontSize: 12, color: "#888", textDecoration: "none", marginTop: 8, paddingLeft: 20 }}>Logout</a>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
    </AppProvider>
  );
}
