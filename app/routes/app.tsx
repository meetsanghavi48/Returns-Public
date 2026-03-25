import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, useNavigate, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { Frame, Navigation, TopBar, Badge, Text } from "@shopify/polaris";
import {
  HomeIcon,
  OrderIcon,
  SettingsIcon,
  ChartVerticalIcon,
  AppsIcon,
  AutomationIcon,
  ListBulletedIcon,
  PlusCircleIcon,
  ExitIcon,
} from "@shopify/polaris-icons";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let pendingCount = 0;
  let totalReturns = 0;
  try {
    pendingCount = await prisma.returnRequest.count({
      where: { shop: session.shop, status: "pending" },
    });
    totalReturns = await prisma.returnRequest.count({
      where: { shop: session.shop },
    });
  } catch {
    // Table may not exist yet
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    pendingCount,
    totalReturns,
  });
};

export default function App() {
  const { apiKey, shop, pendingCount } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavActive, setMobileNavActive] = useState(false);

  const toggleMobileNav = useCallback(
    () => setMobileNavActive((prev) => !prev),
    [],
  );

  const shopName = shop.replace(".myshopify.com", "");

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={toggleMobileNav}
      userMenu={
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 16px" }}>
          <Text as="span" variant="bodySm" tone="subdued">{shopName}</Text>
        </div>
      }
    />
  );

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          {
            url: "/app",
            label: "Home",
            icon: HomeIcon,
            exactMatch: true,
          },
          {
            url: "/app/returns",
            label: "Returns",
            icon: OrderIcon,
            badge: pendingCount > 0 ? String(pendingCount) : undefined,
          },
          {
            url: "/app/returns/new",
            label: "Create Request",
            icon: PlusCircleIcon,
          },
          {
            url: "/app/analytics",
            label: "Analytics",
            icon: ChartVerticalIcon,
          },
        ]}
      />
      <Navigation.Section
        title="Configuration"
        items={[
          {
            url: "/app/settings",
            label: "Settings",
            icon: SettingsIcon,
          },
          {
            url: "/app/settings/automation",
            label: "Automation",
            icon: AutomationIcon,
          },
          {
            url: "/app/audit",
            label: "Audit Log",
            icon: ListBulletedIcon,
          },
        ]}
      />
      <Navigation.Section
        fill
        items={[
          {
            url: `https://${shop}/admin`,
            label: "Back to Shopify",
            icon: ExitIcon,
          },
        ]}
      />
    </Navigation>
  );

  const logo = {
    width: 36,
    topBarSource: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/logo-dark.png",
    accessibilityLabel: "BLAKC Returns",
  };

  return (
    <AppProvider isEmbeddedApp={false} apiKey={apiKey}>
      <Frame
        topBar={topBarMarkup}
        navigation={navigationMarkup}
        showMobileNavigation={mobileNavActive}
        onNavigationDismiss={toggleMobileNav}
        logo={logo}
      >
        <Outlet />
      </Frame>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
