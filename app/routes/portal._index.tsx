import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect, json } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import prisma from "../db.server";
import { getSetting } from "../services/settings.server";

/**
 * /portal — Shopify App Proxy entry point.
 *
 * Shopify proxies https://{shop}/apps/returns → /portal?shop={shop}&...
 * This route reads the shop from query params and serves the portal directly.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Missing shop parameter", shop: null, enableOtp: false });
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  if (!shopRecord || shopRecord.uninstalledAt) {
    return json({ error: "Store not found or app not installed", shop: null, enableOtp: false });
  }

  const enableOtp = await getSetting<boolean>(shop, "enable_email_otp", false);
  const buttonColor = await getSetting<string>(shop, "portal_button_color", "#C84B31");

  return json({ error: null, shop, enableOtp, buttonColor });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopFromQuery = url.searchParams.get("shop");
  const formData = await request.formData();
  const shopFromForm = formData.get("shop") as string;
  const shop = shopFromQuery || shopFromForm;

  if (!shop) return json({ error: "Missing shop" });

  // Redirect to the shop-specific portal route for form handling
  const orderNumber = formData.get("orderNumber") as string;
  const pincode = formData.get("pincode") as string;
  const email = formData.get("email") as string;

  // Build redirect URL to the existing portal.$shop._index route
  const params = new URLSearchParams();
  if (orderNumber) params.set("orderNumber", orderNumber);
  if (pincode) params.set("pincode", pincode);
  if (email) params.set("email", email);

  return redirect(`/portal/${shop}?${params.toString()}`);
};

export default function PortalIndex() {
  const { error, shop, enableOtp, buttonColor } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (error || !shop) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
        <div style={{ textAlign: "center", padding: "40px", background: "#fff", borderRadius: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: "400px" }}>
          <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>Returns Portal</h1>
          <p style={{ color: "#666" }}>{error || "Please access this portal through your store."}</p>
        </div>
      </div>
    );
  }

  const accent = buttonColor || "#C84B31";

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: "#f8f8f8" }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
      />
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
            Returns & Exchanges
          </h1>
          <p style={{ color: "#666", fontSize: "15px" }}>
            Enter your order details to start a return or exchange
          </p>
        </div>

        <div style={{ background: "#fff", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <Form method="post">
            <input type="hidden" name="shop" value={shop} />

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>
                Order Number
              </label>
              <input
                type="text"
                name="orderNumber"
                placeholder="e.g. 1001"
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {enableOtp ? (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="Your order email"
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "15px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>
                  Delivery Pincode
                </label>
                <input
                  type="text"
                  name="pincode"
                  placeholder="6-digit pincode"
                  pattern="[0-9]{6}"
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "15px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "14px",
                background: accent,
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: isSubmitting ? "wait" : "pointer",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "Looking up order..." : "Find My Order"}
            </button>
          </Form>
        </div>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#999" }}>
          Powered by BLAKC Returns
        </p>
      </div>
    </div>
  );
}
