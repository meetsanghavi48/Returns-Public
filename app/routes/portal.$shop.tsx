import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";

import portalStyles from "../styles/portal.css?url";

export const links = () => [
  { rel: "stylesheet", href: portalStyles },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap",
  },
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const shopDomain = params.shop;
  if (!shopDomain) throw new Response("Shop not found", { status: 404 });

  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
  });

  if (!shopRecord || shopRecord.uninstalledAt) {
    throw new Response("This store has not installed the Returns Manager app.", {
      status: 404,
    });
  }

  return json({ shop: shopDomain });
};

export default function PortalLayout() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <div className="portal-wrapper">
      <header className="portal-header">
        <h1 className="portal-logo">Returns Portal</h1>
      </header>
      <main className="portal-main">
        <Outlet />
      </main>
      <footer className="portal-footer">
        <p>Powered by Returns Manager</p>
      </footer>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="portal-wrapper">
      <div className="portal-main">
        <div className="portal-card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <h2>Store Not Found</h2>
          <p>This returns portal is not available. The store may not have installed the app.</p>
        </div>
      </div>
    </div>
  );
}
