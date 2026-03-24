import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Count pending returns for badge
  let pendingCount = 0;
  try {
    pendingCount = await prisma.returnRequest.count({
      where: { shop: session.shop, status: "pending" },
    });
  } catch {
    // Table may not exist yet on first install
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    pendingCount,
  });
};

export default function App() {
  const { apiKey, pendingCount } = useLoaderData<typeof loader>();

  const returnsLabel =
    pendingCount > 0 ? `Returns (${pendingCount})` : "Returns";

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/returns">{returnsLabel}</Link>
        <Link to="/app/integrations">Integrations</Link>
        <Link to="/app/analytics">Analytics</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/audit">Audit Log</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
