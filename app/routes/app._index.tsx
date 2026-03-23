import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // We don't redirect server-side because we're inside Shopify's iframe.
  // Instead, we render a page that breaks out of the iframe to our standalone dashboard.
  return null;
};

export default function AppIndex() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 16, color: "#666" }}>Redirecting to dashboard...</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if (window.top !== window.self) {
              window.top.location.href = window.location.origin + "/admin/auth";
            } else {
              window.location.href = "/admin/auth";
            }
          `,
        }}
      />
    </div>
  );
}
