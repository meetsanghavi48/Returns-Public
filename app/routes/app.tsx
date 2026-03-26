import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import adminStyles from "../styles/admin.css?url";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let pendingCount = 0;
  try {
    pendingCount = await prisma.returnRequest.count({
      where: { shop: session.shop, status: "pending" },
    });
  } catch {
    // Table may not exist yet
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    pendingCount,
  });
};

export default function App() {
  const { apiKey, shop, pendingCount } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-logo">
            <div className="admin-sidebar-logo-icon">R</div>
            <div>
              <div className="admin-sidebar-logo-text">Returns Manager</div>
              <div className="admin-sidebar-logo-sub">Dashboard</div>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            <div className="admin-sidebar-section">
              <div className="admin-sidebar-section-title">Overview</div>
              <NavLink
                to="/app"
                end
                className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="admin-nav-icon">{"\uD83C\uDFE0"}</span>
                Home
              </NavLink>
              <NavLink
                to="/app/returns"
                end
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
                to="/app/analytics"
                className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="admin-nav-icon">{"\uD83D\uDCCA"}</span>
                Analytics
              </NavLink>
              <NavLink
                to="/app/export"
                className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="admin-nav-icon">{"\uD83D\uDCE5"}</span>
                Export Data
              </NavLink>
            </div>

            <div className="admin-sidebar-section">
              <div className="admin-sidebar-section-title">Configuration</div>
              <NavLink
                to="/app/settings"
                end
                className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="admin-nav-icon">{"\u2699\uFE0F"}</span>
                Settings
              </NavLink>
              <NavLink
                to="/app/audit"
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
          </div>
        </aside>

        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
