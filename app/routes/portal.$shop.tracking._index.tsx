import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link, useNavigation } from "@remix-run/react";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";
import { getCurrencySymbol, formatAmount } from "~/utils/currency";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const shop = params.shop!;

  // Fetch shop currency
  let currency = "USD";
  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shop } });
    if (shopRecord?.accessToken) {
      const shopInfo = await shopifyREST(shop, shopRecord.accessToken, "GET", "shop.json?fields=currency");
      currency = shopInfo?.shop?.currency || "USD";
    }
  } catch { /* fallback to USD */ }

  if (!email) {
    return json({ requests: null, email: null, shop, currency });
  }

  const requests = await prisma.returnRequest.findMany({
    where: {
      shop,
      customerEmail: { equals: email, mode: "insensitive" },
    },
    orderBy: { submittedAt: "desc" },
  });

  return json({ requests, email, shop, currency });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const orderNumber = formData.get("orderNumber") as string;
  const shop = params.shop!;

  if (!email && !orderNumber) {
    return json({ error: "Please enter your email or order number." });
  }

  const where: any = { shop };
  if (email) {
    where.customerEmail = { equals: email.trim(), mode: "insensitive" };
  }
  if (orderNumber) {
    const num = orderNumber.replace("#", "").trim();
    where.orderNumber = num;
  }

  const requests = await prisma.returnRequest.findMany({
    where,
    orderBy: { submittedAt: "desc" },
  });

  if (requests.length === 0) {
    return json({ error: "No return requests found." });
  }

  return json({ requests, email: email || null, orderNumber: orderNumber || null });
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  pickup_scheduled: "Pickup Scheduled",
  in_transit: "In Transit",
  delivered: "Delivered",
  refunded: "Refunded",
  exchange_fulfilled: "Exchange Fulfilled",
  rejected: "Rejected",
  archived: "Archived",
};

const badgeClass: Record<string, string> = {
  pending: "portal-badge-pending",
  approved: "portal-badge-approved",
  pickup_scheduled: "portal-badge-pickup",
  in_transit: "portal-badge-transit",
  delivered: "portal-badge-delivered",
  refunded: "portal-badge-refunded",
  exchange_fulfilled: "portal-badge-exchanged",
  rejected: "portal-badge-rejected",
};

export default function PortalTrackingList() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const shop = loaderData.shop;
  const currency = loaderData.currency || "USD";
  const cs = getCurrencySymbol(currency);

  const requests = actionData?.requests || loaderData.requests;
  const error = actionData?.error;

  return (
    <>
      <div className="portal-card">
        <h2>Track Your Returns</h2>
        <p style={{ fontSize: 14, color: "var(--portal-text-muted)", marginBottom: 16 }}>
          Enter your email or order number to view all your return requests.
        </p>

        {error && <div className="portal-error">{error}</div>}

        <Form method="post">
          <div className="portal-field">
            <label className="portal-label">Email Address</label>
            <input
              className="portal-input"
              type="email"
              name="email"
              placeholder="your@email.com"
            />
          </div>

          <div style={{ textAlign: "center", fontSize: 13, color: "var(--portal-text-muted)", margin: "8px 0" }}>
            — or —
          </div>

          <div className="portal-field">
            <label className="portal-label">Order Number</label>
            <input
              className="portal-input"
              type="text"
              name="orderNumber"
              placeholder="#1001"
            />
          </div>

          <button
            className="portal-btn portal-btn-primary"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: 12 }}
          >
            {isLoading ? "Searching..." : "Find Requests"}
          </button>
        </Form>
      </div>

      {requests && requests.length > 0 && (
        <div className="portal-card">
          <h3 style={{ marginBottom: 12 }}>
            {requests.length} Request{requests.length > 1 ? "s" : ""} Found
          </h3>

          {requests.map((r: any) => {
            const items = (r.items || []) as any[];
            const itemCount = items.length;
            const totalAmount = items.reduce(
              (s: number, i: any) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
              0,
            );

            return (
              <Link
                key={r.reqId}
                to={`/portal/${shop}/tracking/${r.reqId}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div
                  className="portal-item"
                  style={{
                    padding: "14px 16px",
                    marginBottom: 8,
                    borderRadius: "var(--portal-radius)",
                    border: "1px solid var(--portal-border)",
                    transition: "box-shadow 0.2s",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>
                        Order #{r.orderNumber}
                      </span>
                      <span className={`portal-badge ${badgeClass[r.status] || ""}`} style={{ fontSize: 11 }}>
                        {statusLabel[r.status] || r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--portal-text)", marginBottom: 4 }}>
                      {items.map((i: any) => i.title).join(", ")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--portal-text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ textTransform: "capitalize" }}>{r.requestType || "return"}</span>
                      <span>{itemCount} item{itemCount > 1 ? "s" : ""}</span>
                      <span>{cs}{formatAmount(totalAmount, currency)}</span>
                      <span>{new Date(r.submittedAt).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: "var(--portal-text-muted)", marginLeft: 12 }}>›</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link
          to={`/portal/${shop}`}
          className="portal-btn portal-btn-secondary"
          style={{ display: "inline-block", width: "auto", padding: "10px 20px", textDecoration: "none" }}
        >
          ← New Return Request
        </Link>
      </div>
    </>
  );
}
