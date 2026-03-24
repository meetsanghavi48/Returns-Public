import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest, archiveRequest } from "../services/returns.server";
import { processRefund } from "../services/refunds.server";
import { createExchangeOrder } from "../services/exchanges.server";
import { createDelhiveryPickup } from "../services/delhivery.server";
import { auditLog } from "../services/audit.server";
import { shopifyREST } from "../services/shopify.server";
import { getSetting } from "../services/settings.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop, accessToken } = await requireAdminAuth(request);
  const returnReq = await prisma.returnRequest.findFirst({
    where: { shop, reqId: params.reqId },
  });
  if (!returnReq) throw new Response("Not found", { status: 404 });

  // Fetch audit logs
  const auditLogs = await prisma.auditLog.findMany({
    where: { shop, reqId: params.reqId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Fetch all requests for this order (multi-request history)
  const orderRequests = await prisma.returnRequest.findMany({
    where: { shop, orderId: returnReq.orderId },
    orderBy: { createdAt: "desc" },
  });

  // Fetch Shopify order details (tags, financial_status, total_price)
  let orderDetails: any = null;
  try {
    const orderData = await shopifyREST(shop, accessToken, "GET", `/orders/${returnReq.orderId}.json`);
    orderDetails = orderData?.order || null;
  } catch (e) {
    // Silently fail — order details are supplementary
  }

  // Get settings
  const returnShippingFee = await getSetting(shop, "return_shipping_fee", 100);
  const restockingFeePct = await getSetting(shop, "restocking_fee_pct", 0);

  // Get store currency
  const currency = orderDetails?.currency || "USD";

  return json({ returnReq, auditLogs, orderRequests, orderDetails, returnShippingFee, restockingFeePct, currency });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop, accessToken } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqId = params.reqId!;

  try {
    switch (intent) {
      case "approve":
        await approveRequest(shop, accessToken, reqId);
        return json({ ok: true, message: "Request approved" });
      case "reject": {
        const reason = (formData.get("reason") as string) || "";
        await rejectRequest(shop, accessToken, reqId, reason);
        return json({ ok: true, message: "Request rejected" });
      }
      case "create_pickup": {
        const req = await prisma.returnRequest.findFirst({ where: { shop, reqId } });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        await createDelhiveryPickup(shop, accessToken, req);
        return json({ ok: true, message: "Pickup created" });
      }
      case "mark_delivered": {
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { status: "delivered" },
        });
        await auditLog(shop, null, reqId, "mark_delivered", "admin", "Marked as received/delivered");
        return json({ ok: true, message: "Marked as received" });
      }
      case "process_refund": {
        const req = await prisma.returnRequest.findFirst({ where: { shop, reqId } });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        const result = await processRefund(shop, accessToken, req);
        return json({ ok: true, message: result ? `Refund processed` : "Refund failed" });
      }
      case "create_exchange": {
        const req = await prisma.returnRequest.findFirst({ where: { shop, reqId } });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        const result = await createExchangeOrder(shop, accessToken, req);
        return json({ ok: true, message: result ? `Exchange: ${result.order_name}` : "Exchange failed" });
      }
      case "archive":
        await archiveRequest(shop, reqId);
        return json({ ok: true, message: "Archived" });
      case "unarchive":
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { status: "delivered", archivedAt: null },
        });
        await auditLog(shop, null, reqId, "unarchived", "admin", "");
        return json({ ok: true, message: "Unarchived" });
      case "attach_awb": {
        const awb = formData.get("awb") as string;
        if (!awb) return json({ error: "AWB required" }, { status: 400 });
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { awb, awbStatus: "Manually attached", status: "pickup_scheduled" },
        });
        await auditLog(shop, null, reqId, "awb_attached", "admin", `AWB:${awb}`);
        return json({ ok: true, message: `AWB ${awb} attached` });
      }
      case "add_utr": {
        const utr = formData.get("utr") as string;
        if (!utr) return json({ error: "UTR required" }, { status: 400 });
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { utrNumber: utr },
        });
        await auditLog(shop, null, reqId, "utr_added", "admin", `UTR:${utr}`);
        return json({ ok: true, message: `UTR ${utr} added` });
      }
      case "delete": {
        await prisma.returnRequest.delete({ where: { reqId, shop } });
        await auditLog(shop, null, reqId, "deleted", "admin", "");
        return json({ ok: true, message: "Deleted", redirect: "/admin/returns" });
      }
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};

// Helpers
const STATUS_MAP: Record<string, { icon: string; label: string; desc: string; color: string }> = {
  pending: { icon: "⏳", label: "Pending", desc: "Awaiting review", color: "#f59e0b" },
  approved: { icon: "✅", label: "Approved", desc: "Ready for pickup", color: "#3b82f6" },
  pickup_scheduled: { icon: "🚚", label: "Pickup Scheduled", desc: "Pickup has been scheduled", color: "#6366f1" },
  in_transit: { icon: "📦", label: "In Transit", desc: "Package is on its way back", color: "#6366f1" },
  delivered: { icon: "✅", label: "Delivered", desc: "Received at warehouse", color: "#10b981" },
  refunded: { icon: "💰", label: "Refunded", desc: "Refund has been processed", color: "#10b981" },
  exchange_fulfilled: { icon: "🔄", label: "Exchange Fulfilled", desc: "Exchange order created", color: "#10b981" },
  rejected: { icon: "❌", label: "Rejected", desc: "Request was rejected", color: "#ef4444" },
  archived: { icon: "📁", label: "Archived", desc: "Request archived", color: "#6b7280" },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminReturnDetail() {
  const { returnReq, auditLogs, orderRequests, orderDetails, returnShippingFee, restockingFeePct, currency } = useLoaderData<typeof loader>();
  const currencySymbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", JPY: "¥", SGD: "S$", AED: "AED " };
  const cs = currencySymbols[currency] || currency + " ";
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [awbInput, setAwbInput] = useState("");
  const [utrInput, setUtrInput] = useState("");

  // Redirect on delete
  if (actionData?.redirect) {
    if (typeof window !== "undefined") window.location.href = actionData.redirect;
  }

  const r = returnReq as any;
  const items = (r.items || []) as any[];
  const address = r.address || {};
  const exchangeItems = items.filter((i: any) => i.action === "exchange");
  const returnItems = items.filter((i: any) => i.action === "return");
  const isReturn = r.requestType === "return" || r.requestType === "mixed";
  const isExchange = r.requestType === "exchange" || r.requestType === "mixed";
  const isPending = r.status === "pending";
  const isApproved = r.status === "approved";
  const isRefunded = !!r.refundId || r.status === "refunded";
  const isRejected = r.status === "rejected";
  const isArchived = r.status === "archived";
  const isExFulfilled = r.status === "exchange_fulfilled";

  const prefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
  const num = r.reqNum ? String(r.reqNum).padStart(3, "0") : (r.reqId || "").slice(-6).toUpperCase();
  const displayId = `${prefix}-${num}`;
  const statusInfo = STATUS_MAP[r.status] || STATUS_MAP.pending;

  // Refund breakdown
  const origTotal = items.reduce((s: number, i: any) => s + (parseFloat(i.original_price || i.price || 0) * (parseInt(i.qty) || 1)), 0);
  const netTotal = items.reduce((s: number, i: any) => s + (parseFloat(i.price || 0) * (parseInt(i.qty) || 1)), 0);
  const discTotal = origTotal - netTotal;
  const retFee = r.refundMethod === "store_credit" ? 0 : Number(returnShippingFee);
  const restockFee = Number(restockingFeePct) > 0 ? netTotal * (Number(restockingFeePct) / 100) : 0;
  const totalRefund = Math.max(0, netTotal - retFee - restockFee);

  const doAction = (intent: string, extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.set("intent", intent);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    submit(fd, { method: "post" });
  };

  // Order info from Shopify
  const orderTags = orderDetails?.tags?.split(",").map((t: string) => t.trim()).filter(Boolean) || [];
  const orderTotal = orderDetails?.total_price || "0";
  const financialStatus = orderDetails?.financial_status || "unknown";

  return (
    <div className="dp">
      {/* === TOP BAR === */}
      <div className="dp-topbar">
        <a href="/admin/returns" className="dp-back">‹ All Returns</a>
        <div className="dp-topbar-center">
          <span className="dp-req-id">#{displayId}</span>
          <div className="dp-order-num">
            #{r.orderNumber || r.orderId}
            {orderDetails && (
              <a href={`https://${r.shop || ""}/admin/orders/${r.orderId}`} target="_blank" rel="noreferrer" className="dp-ext-link" title="Open in Shopify">↗</a>
            )}
          </div>
        </div>
        <div className="dp-topbar-right">
          {isPending && (
            <>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => doAction("reject")} disabled={isLoading}>Reject</button>
              <button className="admin-btn admin-btn-primary" onClick={() => doAction("approve")} disabled={isLoading}>
                {isLoading ? "..." : "Approve"}
              </button>
            </>
          )}
          {isApproved && !isRefunded && isExchange && (
            <button className="admin-btn admin-btn-primary" onClick={() => doAction("mark_delivered")} disabled={isLoading}>
              Mark as Received
            </button>
          )}
          {isApproved && !isRefunded && isReturn && (
            <button className="admin-btn admin-btn-success" onClick={() => doAction("process_refund")} disabled={isLoading}>
              Mark Received & Refund
            </button>
          )}
        </div>
      </div>

      {/* === SUB BAR === */}
      <div className="dp-subbar">
        {isArchived ? (
          <button className="dp-action-link" onClick={() => doAction("unarchive")}>📂 Unarchive</button>
        ) : !isPending && !isRejected ? (
          <button className="dp-action-link" onClick={() => doAction("archive")}>📁 Archive</button>
        ) : null}
        {isExchange && !isExFulfilled && !isPending && (
          <button className="dp-action-link" onClick={() => doAction("create_exchange")}>🔄 Create exchange order</button>
        )}
        {r.awb && (
          <button className="dp-action-link" onClick={() => doAction("create_pickup")}>🚚 Regenerate Pickup</button>
        )}
        <button className="dp-action-link danger" onClick={() => { if (confirm("Delete this return request?")) doAction("delete"); }}>🗑 Delete</button>
        {!isRejected && !isExFulfilled && !isRefunded && !isPending && (
          <button className="dp-action-link danger" onClick={() => doAction("reject")}>✗ Reject</button>
        )}
      </div>

      {/* === ACTION FEEDBACK === */}
      {actionData?.message && (
        <div className={`admin-banner ${actionData.error ? "error" : "success"}`}>
          {actionData.message || actionData.error}
        </div>
      )}

      {/* === TWO COLUMN LAYOUT === */}
      <div className="dp-layout">
        {/* LEFT COLUMN */}
        <div className="dp-main">
          {/* Status Card */}
          <div className="dp-status-card">
            <div className="dp-status-header">
              <span className="dp-status-icon" style={{ color: statusInfo.color }}>{statusInfo.icon}</span>
              <div>
                <div className="dp-status-label">{statusInfo.label}</div>
                <div className="dp-status-desc">{statusInfo.desc}</div>
              </div>
              <span className="dp-status-time">{timeAgo(r.approvedAt || r.createdAt)}</span>
            </div>

            {/* Shipment info */}
            {r.awb ? (
              <div className="dp-shipment-grid">
                <div>
                  <div className="dp-shipment-label">Shipment Status</div>
                  <div className="dp-shipment-value">🚚 {r.awbStatus || "Requested"}</div>
                  {r.awbLastChecked && <div className="dp-shipment-sub">Last updated: {new Date(r.awbLastChecked).toLocaleString("en-IN")}</div>}
                </div>
                <div>
                  <div className="dp-shipment-label">Logistic Partner</div>
                  <div className="dp-shipment-value">Delhivery</div>
                </div>
                <div>
                  <div className="dp-shipment-label">Tracking ID</div>
                  <div className="dp-shipment-value">
                    <a href={`https://www.delhivery.com/track/package/${r.awb}`} target="_blank" rel="noreferrer" style={{ color: "var(--admin-accent)" }}>
                      {r.awb} ↗
                    </a>
                  </div>
                </div>
              </div>
            ) : isApproved ? (
              <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <input className="admin-input" placeholder="Enter AWB manually" value={awbInput} onChange={(e) => setAwbInput(e.target.value)} style={{ flex: 1 }} />
                <button className="admin-btn admin-btn-sm" onClick={() => doAction("attach_awb", { awb: awbInput })} disabled={!awbInput}>Set</button>
                <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => doAction("create_pickup")} disabled={isLoading}>
                  🚚 Create Pickup
                </button>
              </div>
            ) : null}
          </div>

          {/* Exchange Items */}
          {exchangeItems.length > 0 && (
            <div className="admin-card">
              <h3 className="admin-card-title">Exchange Items</h3>
              <hr className="admin-divider" />
              {exchangeItems.map((item: any, idx: number) => (
                <div className="dp-exchange-row" key={idx}>
                  <div className="dp-exchange-original">
                    <div className="dp-exchange-col-title">Original item</div>
                    <div className="dp-exchange-item">
                      {item.image_url && <img src={item.image_url} alt={item.title} className="dp-exchange-img" />}
                      <div>
                        <div className="dp-exchange-name">{item.title}</div>
                        <div className="dp-exchange-variant">{item.variant_title || "Default"}</div>
                        <div className="dp-exchange-price">{cs}{parseFloat(item.price).toLocaleString("en-IN")} × {item.qty || 1}</div>
                        {item.reason && <span className="dp-reason-badge">{item.reason}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="dp-exchange-arrow">⇄</div>
                  <div className="dp-exchange-new">
                    <div className="dp-exchange-col-title">Exchanged item</div>
                    <div className={`dp-exchange-status-box ${item.exchange_variant_title ? "complete" : "incomplete"}`}>
                      <span className="dp-exchange-status-icon">{item.exchange_variant_title ? "🔄" : "⚠️"}</span>
                      <div>
                        <div className="dp-exchange-name">
                          {item.exchange_product_title || item.exchange_variant_title || "No variant selected"}
                        </div>
                        {item.exchange_variant_title && (
                          <div className="dp-exchange-variant">{item.exchange_variant_title}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Return Items */}
          {returnItems.length > 0 && (
            <div className="admin-card">
              <h3 className="admin-card-title">Return Items</h3>
              <hr className="admin-divider" />
              {returnItems.map((item: any, idx: number) => (
                <div className="admin-item-row" key={idx}>
                  <span className="dp-item-num">{idx + 1}</span>
                  {item.image_url && <img className="admin-item-img" src={item.image_url} alt={item.title} />}
                  <div className="admin-item-info">
                    <div className="admin-item-title">{item.title}</div>
                    <div className="admin-item-meta">
                      {item.variant_title || "Default"} · Qty: {item.qty || 1}
                    </div>
                    {item.reason && <span className="dp-reason-badge">{item.reason}</span>}
                  </div>
                  <div className="admin-item-price">
                    {cs}{parseFloat(item.price).toLocaleString("en-IN")} × {item.qty || 1}
                    <div style={{ fontWeight: 700, marginTop: 2 }}>{cs}{(parseFloat(item.price) * (parseInt(item.qty) || 1)).toLocaleString("en-IN")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Refund Breakdown */}
          {isReturn && (
            <div className="admin-card">
              <h3 className="admin-card-title">Refund Breakdown</h3>
              <hr className="admin-divider" />
              <table className="dp-refund-table">
                <tbody>
                  <tr>
                    <td>Item price</td>
                    <td className="dp-refund-calc">{cs}{origTotal.toFixed(2)} × 1</td>
                    <td className="dp-refund-amount">{cs}{origTotal.toFixed(2)}</td>
                  </tr>
                  {discTotal > 0 && (
                    <tr>
                      <td>Discount</td>
                      <td></td>
                      <td className="dp-refund-amount" style={{ color: "var(--admin-danger)" }}>- {cs}{discTotal.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Return Fee {!isRefunded && <span className="dp-fee-pill">Pending</span>}</td>
                    <td></td>
                    <td className="dp-refund-amount">- {cs}{retFee.toFixed(2)}</td>
                  </tr>
                  {restockFee > 0 && (
                    <tr>
                      <td>Restocking Fee ({restockingFeePct}%)</td>
                      <td></td>
                      <td className="dp-refund-amount">- {cs}{restockFee.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="dp-refund-total">
                    <td><strong>Total (To be refunded)</strong></td>
                    <td></td>
                    <td className="dp-refund-amount"><strong>{cs}{totalRefund.toFixed(2)}</strong></td>
                  </tr>
                </tbody>
              </table>
              {isRefunded && r.refundAmount && (
                <>
                  <hr className="admin-divider" />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>Refunded</span>
                    <span style={{ fontWeight: 700, color: "var(--admin-success)" }}>{cs}{Number(r.refundAmount).toLocaleString("en-IN")}</span>
                  </div>
                  {r.utrNumber ? (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span className="admin-item-meta">UTR</span>
                      <span>{r.utrNumber}</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input className="admin-input" placeholder="UTR number" value={utrInput} onChange={(e) => setUtrInput(e.target.value)} style={{ flex: 1 }} />
                      <button className="admin-btn admin-btn-sm" onClick={() => doAction("add_utr", { utr: utrInput })} disabled={!utrInput}>Add UTR</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Shopify Actions */}
          {!isPending && !isRejected && !isArchived && (
            <div className="admin-card">
              <h3 className="admin-card-title">Shopify Actions</h3>
              <hr className="admin-divider" />
              <div className="dp-shopify-actions">
                {isReturn && !isRefunded && (
                  <div className="dp-shopify-action-row">
                    <span className="dp-action-icon">💰</span>
                    <div className="dp-action-info">
                      <div className="dp-action-name">Process Refund</div>
                      <div className="dp-action-desc">Refund {cs}{totalRefund.toFixed(2)} to {r.refundMethod === "store_credit" ? "store credit" : "original payment"}</div>
                    </div>
                    <button className="admin-btn admin-btn-sm admin-btn-success" onClick={() => doAction("process_refund")} disabled={isLoading}>
                      Create Refund
                    </button>
                  </div>
                )}
                {isReturn && !isRefunded && (
                  <div className="dp-shopify-action-row">
                    <span className="dp-action-icon">🎁</span>
                    <div className="dp-action-info">
                      <div className="dp-action-name">Issue Store Credit</div>
                      <div className="dp-action-desc">Create a gift card for {cs}{netTotal.toFixed(2)}</div>
                    </div>
                    <button className="admin-btn admin-btn-sm" onClick={() => doAction("process_refund")} disabled={isLoading}>
                      Issue Credit
                    </button>
                  </div>
                )}
                {isExchange && (
                  <div className="dp-shopify-action-row">
                    <span className="dp-action-icon">🛍️</span>
                    <div className="dp-action-info">
                      <div className="dp-action-name">Create Exchange Order</div>
                      <div className="dp-action-desc">
                        {r.exchangeOrderId ? `Exchange order created: ${r.exchangeOrderName}` : "Creates a new order with exchanged items"}
                      </div>
                    </div>
                    {!r.exchangeOrderId && (
                      <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => doAction("create_exchange")} disabled={isLoading}>
                        Create Order
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="admin-card">
            <h3 className="admin-card-title">Timeline</h3>
            <hr className="admin-divider" />
            {auditLogs.length === 0 ? (
              <p className="admin-item-meta">No activity yet.</p>
            ) : (
              <div className="dp-timeline">
                {auditLogs.map((log: any) => (
                  <div className="dp-timeline-entry" key={log.id}>
                    <div className="dp-timeline-dot" />
                    <div className="dp-timeline-content">
                      <div className="dp-timeline-text">
                        <strong>{log.action}</strong>
                        {log.details && <span> — {log.details}</span>}
                      </div>
                      <div className="dp-timeline-meta">
                        {log.actor || "system"} · {new Date(log.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="dp-sidebar">
          {/* Reason */}
          <div className="dp-sidebar-card">
            <div className="dp-sidebar-title">Reason</div>
            <p className="dp-sidebar-text">{items[0]?.reason || "Not specified"}</p>
          </div>

          {/* Customer */}
          <div className="dp-sidebar-card">
            <div className="dp-sidebar-title">Customer</div>
            <p className="dp-sidebar-link">{r.customerName || "Unknown"}</p>
          </div>

          {/* Contact */}
          {(r.customerEmail || address.phone) && (
            <div className="dp-sidebar-card">
              <div className="dp-sidebar-title">Contact Information</div>
              {r.customerEmail && <p className="dp-sidebar-link">{r.customerEmail}</p>}
              {address.phone && <p className="dp-sidebar-text">{address.phone}</p>}
            </div>
          )}

          {/* Refund Mode */}
          <div className="dp-sidebar-card">
            <div className="dp-sidebar-title">Refund Mode</div>
            <p className="dp-sidebar-text" style={{ fontWeight: 600 }}>
              {r.refundMethod === "store_credit" ? "Store Credit" : r.refundMethod === "original" ? "Original Payment" : r.requestType === "exchange" ? "Exchange" : "Not set"}
            </p>
            {financialStatus !== "unknown" && (
              <p className="dp-sidebar-meta">Payment: {financialStatus}</p>
            )}
          </div>

          {/* Address */}
          {address && (address.name || address.address1) && (
            <div className="dp-sidebar-card">
              <div className="dp-sidebar-title">Customer's Address</div>
              <p className="dp-sidebar-text">
                {address.name && <>{address.name}<br /></>}
                {address.address1 && <>{address.address1}<br /></>}
                {address.address2 && <>{address.address2}<br /></>}
                {address.city && <>{address.city}, </>}
                {address.province && <>{address.province} </>}
                {address.zip && <>{address.zip}<br /></>}
                {address.country && <>{address.country}</>}
              </p>
              {address.phone && <p className="dp-sidebar-meta">{address.phone}</p>}
            </div>
          )}

          {/* Notes */}
          <div className="dp-sidebar-card">
            <div className="dp-sidebar-title">Notes</div>
            <p className="dp-sidebar-text" style={{ fontStyle: "italic" }}>
              No notes added
            </p>
          </div>

          {/* Tags */}
          {orderTags.length > 0 && (
            <div className="dp-sidebar-card">
              <div className="dp-sidebar-title">Tags</div>
              <div className="dp-tags">
                {orderTags.filter((t: string) => !t.startsWith("return-") && !t.startsWith("exchange-") && !t.startsWith("pickup-")).map((tag: string) => (
                  <span className="dp-tag" key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Order Info */}
          <div className="dp-sidebar-card">
            <div className="dp-sidebar-title">Order Info</div>
            <table className="dp-info-table">
              <tbody>
                <tr><td>Order #</td><td>{r.orderNumber}</td></tr>
                <tr><td>Order Total</td><td>{cs}{parseFloat(orderTotal).toLocaleString("en-IN")}</td></tr>
                <tr><td>Payment</td><td><span className={`admin-badge ${financialStatus === "paid" ? "delivered" : "pending"}`}>{financialStatus}</span></td></tr>
                <tr><td>Type</td><td>{r.isCod ? <span className="admin-badge pending">COD</span> : "Prepaid"}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Multi-request history */}
          {orderRequests.length > 1 && (
            <div className="dp-sidebar-card">
              <div className="dp-sidebar-title">Request History ({orderRequests.length})</div>
              {orderRequests.map((req: any) => {
                const p = req.requestType === "exchange" ? "EXC" : req.requestType === "mixed" ? "MIX" : "RET";
                const rid = `${p}-${(req.reqId || "").slice(-6).toUpperCase()}`;
                const isCurrent = req.reqId === r.reqId;
                return (
                  <a
                    key={req.reqId}
                    href={`/admin/return/${req.reqId}`}
                    className={`dp-history-item ${isCurrent ? "current" : ""}`}
                  >
                    <span style={{ fontWeight: 600 }}>{rid}</span>
                    <span className={`admin-badge ${req.status}`} style={{ fontSize: 11 }}>{STATUS_MAP[req.status]?.label || req.status}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
