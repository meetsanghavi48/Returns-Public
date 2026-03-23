import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  return json({ shop: session.shop, appUrl });
};

export default function AppIndex() {
  const { shop, appUrl } = useLoaderData<typeof loader>();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 16, color: "#666" }}>Redirecting to dashboard...</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var url = "${appUrl}/admin-auth?shop=${shop}";
              try {
                if (window.top !== window.self) {
                  window.open(url, "_top");
                } else {
                  window.location.href = url;
                }
              } catch(e) {
                // Cross-origin iframe - use a link instead
                var a = document.createElement("a");
                a.href = url;
                a.target = "_top";
                a.textContent = "Click here to open dashboard";
                a.style.cssText = "display:inline-block;padding:12px 24px;background:#6c5ce7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;";
                document.querySelector("div").appendChild(a);
                document.querySelector("p").textContent = "Click below to open the dashboard:";
              }
            })();
          `,
        }}
      />
    </div>
  );
}
