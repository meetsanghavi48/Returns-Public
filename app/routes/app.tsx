import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

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

interface NavItem {
  url: string;
  label: string;
  icon: string;
  badge?: string;
  exactMatch?: boolean;
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      to={item.url}
      prefetch="intent"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 14px",
        borderRadius: "8px",
        textDecoration: "none",
        fontSize: "13.5px",
        fontWeight: isActive ? 600 : 450,
        color: isActive ? "#1a1a1a" : "#616161",
        backgroundColor: isActive ? "#f3f3f3" : "transparent",
        transition: "all 0.15s ease",
      }}
    >
      <span style={{ fontSize: "16px", width: "20px", textAlign: "center" }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{
          background: "#e51c00",
          color: "#fff",
          fontSize: "11px",
          fontWeight: 600,
          padding: "1px 7px",
          borderRadius: "10px",
          minWidth: "20px",
          textAlign: "center",
        }}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export default function App() {
  const { apiKey, shop, pendingCount } = useLoaderData<typeof loader>();
  const location = useLocation();

  const mainNav: NavItem[] = [
    { url: "/app", label: "Home", icon: "\u2302", exactMatch: true },
    { url: "/app/returns", label: "Returns", icon: "\uD83D\uDCE6", badge: pendingCount > 0 ? String(pendingCount) : undefined },
    { url: "/app/returns/new", label: "Create Request", icon: "\u2795" },
    { url: "/app/analytics", label: "Analytics", icon: "\uD83D\uDCC8" },
  ];

  const configNav: NavItem[] = [
    { url: "/app/settings", label: "Settings", icon: "\u2699\uFE0F" },
    { url: "/app/settings/automation", label: "Automation", icon: "\u26A1" },
    { url: "/app/audit", label: "Audit Log", icon: "\uD83D\uDCCB" },
  ];

  const isActive = (item: NavItem) => {
    if (item.exactMatch) return location.pathname === item.url;
    return location.pathname.startsWith(item.url);
  };

  return (
    <AppProvider isEmbeddedApp={false} apiKey={apiKey}>
      <div style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#f6f6f7",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        {/* Sidebar */}
        <aside style={{
          width: "220px",
          minWidth: "220px",
          backgroundColor: "#fff",
          borderRight: "1px solid #e3e3e3",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
        }}>
          {/* Logo */}
          <div style={{
            padding: "18px 16px 12px",
            borderBottom: "1px solid #f0f0f0",
          }}>
            <div style={{
              fontSize: "17px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              color: "#1a1a1a",
            }}>
              BLAKC Returns
            </div>
          </div>

          {/* Main Nav */}
          <nav style={{ padding: "10px 8px", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {mainNav.map((item) => (
                <NavLink key={item.url} item={item} isActive={isActive(item)} />
              ))}
            </div>

            {/* Configuration Section */}
            <div style={{
              marginTop: "20px",
              paddingTop: "12px",
              borderTop: "1px solid #f0f0f0",
            }}>
              <div style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "0 14px 8px",
              }}>
                Configuration
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {configNav.map((item) => (
                  <NavLink key={item.url} item={item} isActive={isActive(item)} />
                ))}
              </div>
            </div>
          </nav>

          {/* Bottom link */}
          <div style={{ padding: "12px 8px", borderTop: "1px solid #f0f0f0" }}>
            <a
              href={`https://${shop}/admin`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 14px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "13px",
                color: "#888",
              }}
            >
              <span style={{ fontSize: "14px" }}>{"\u2190"}</span>
              Back to Shopify
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main style={{
          flex: 1,
          marginLeft: "220px",
          minHeight: "100vh",
          padding: "24px 32px",
          maxWidth: "1200px",
        }}>
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
