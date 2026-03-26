import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";
import { getCurrencySymbol, formatAmount } from "~/utils/currency";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const shopDomain = params.shop!;
  const reqId = params.reqId!;

  const request = await prisma.returnRequest.findFirst({
    where: { shop: shopDomain, reqId },
  });

  if (!request) throw new Response("Request not found", { status: 404 });

  // Fetch shop currency
  let currency = "USD";
  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (shopRecord?.accessToken) {
      const shopInfo = await shopifyREST(shopDomain, shopRecord.accessToken, "GET", "shop.json?fields=currency");
      currency = shopInfo?.shop?.currency || "USD";
    }
  } catch { /* fallback to USD */ }

  return json({ request, shop: shopDomain, currency });
};

const STATUS_STEPS = [
  { key: "pending", label: "Request Submitted" },
  { key: "approved", label: "Approved" },
  { key: "pickup_scheduled", label: "Pickup Scheduled" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered to Warehouse" },
  { key: "refunded", label: "Refund Processed" },
];

const STATUS_STEPS_EXCHANGE = [
  { key: "pending", label: "Request Submitted" },
  { key: "approved", label: "Approved" },
  { key: "pickup_scheduled", label: "Pickup Scheduled" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered to Warehouse" },
  { key: "exchange_fulfilled", label: "Exchange Order Created" },
];

function getStatusIndex(status: string, steps: typeof STATUS_STEPS) {
  const idx = steps.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export default function PortalTracking() {
  const { request, shop, currency } = useLoaderData<typeof loader>();
  const r = request as any;
  const cs = getCurrencySymbol(currency || "USD");
  const items = (r.items || []) as any[];

  const isExchange = r.requestType === "exchange";
  const steps = isExchange ? STATUS_STEPS_EXCHANGE : STATUS_STEPS;
  const currentIdx = getStatusIndex(r.status, steps);

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

  return (
    <>
      <div className="portal-steps">
        <div className="portal-step done" />
        <div className="portal-step done" />
        <div className="portal-step done" />
        <div className="portal-step active" />
      </div>

      {r.status === "rejected" ? (
        <div className="portal-card">
          <div className="portal-error" style={{ margin: 0 }}>
            Your return request has been rejected. Please contact the store for more information.
          </div>
        </div>
      ) : (
        <div className="portal-success">
          Your return request has been submitted successfully.
        </div>
      )}

      <div className="portal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Request Status</h2>
          <span className={`portal-badge ${badgeClass[r.status] || ""}`}>
            {statusLabel[r.status] || r.status}
          </span>
        </div>

        <div style={{ fontSize: 14, color: "var(--portal-text-muted)", marginBottom: 16 }}>
          Request ID: {r.reqId}
          <br />
          Order: #{r.orderNumber}
          <br />
          Submitted: {new Date(r.submittedAt).toLocaleDateString("en-IN")}
        </div>

        {/* Progress Timeline */}
        {r.status !== "rejected" && (
          <ul className="portal-timeline">
            {steps.map((step, idx) => (
              <li
                key={step.key}
                className={idx < currentIdx ? "done" : idx === currentIdx ? "active" : ""}
              >
                <div style={{ fontWeight: idx <= currentIdx ? 600 : 400, fontSize: 14 }}>
                  {step.label}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Items */}
      <div className="portal-card">
        <h3>Items</h3>
        {items.map((item: any, idx: number) => (
          <div className="portal-item" key={idx}>
            {item.image_url && (
              <img className="portal-item-image" src={item.image_url} alt={item.title} />
            )}
            <div className="portal-item-info">
              <div className="portal-item-title">{item.title}</div>
              <div className="portal-item-meta">
                {item.variant_title || ""} &middot; Qty: {item.qty || 1} &middot;{" "}
                <span style={{ textTransform: "capitalize" }}>{item.action}</span>
              </div>
            </div>
            <div className="portal-item-price">{cs}{item.price}</div>
          </div>
        ))}
      </div>

      {/* AWB Tracking */}
      {r.awb && (
        <div className="portal-card">
          <h3>Shipment Tracking</h3>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            <strong>AWB:</strong> {r.awb}
            <br />
            <strong>Status:</strong> {r.awbStatus || "Awaiting update"}
          </div>
        </div>
      )}

      {/* Exchange Info */}
      {r.exchangeOrderName && (
        <div className="portal-card">
          <h3>Exchange Order</h3>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Your exchange order <strong>{r.exchangeOrderName}</strong> has been created.
            You will receive a separate confirmation email.
          </div>
        </div>
      )}

      {/* Refund Info */}
      {r.refundAmount && (
        <div className="portal-card">
          <h3>Refund</h3>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            <strong>Amount:</strong> {cs}{formatAmount(Number(r.refundAmount), currency || "USD")}
            <br />
            <strong>Method:</strong>{" "}
            {r.refundMethod === "store_credit" ? "Store Credit" : "Original Payment"}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link
          to={`/portal/${shop}`}
          className="portal-btn portal-btn-secondary"
          style={{ display: "inline-block", width: "auto", padding: "10px 20px", textDecoration: "none" }}
        >
          Submit Another Return
        </Link>
      </div>
    </>
  );
}
