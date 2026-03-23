import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest, archiveRequest } from "../services/returns.server";
import { processRefund } from "../services/refunds.server";
import { createExchangeOrder } from "../services/exchanges.server";
import { createDelhiveryPickup } from "../services/delhivery.server";
import { auditLog } from "../services/audit.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const returnReq = await prisma.returnRequest.findFirst({
    where: { shop, reqId: params.reqId },
  });
  if (!returnReq) throw new Response("Not found", { status: 404 });

  const auditLogs = await prisma.auditLog.findMany({
    where: { shop, reqId: params.reqId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return json({ returnReq, auditLogs });
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
      case "process_refund": {
        const req = await prisma.returnRequest.findFirst({ where: { shop, reqId } });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        const result = await processRefund(shop, accessToken, req);
        return json({ ok: true, message: result ? `Refund: ₹${result.amount}` : "Refund failed" });
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
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};

function statusLabel(s: string) {
  const m: Record<string, string> = {
    pending: "Pending", approved: "Approved", pickup_scheduled: "Pickup Scheduled",
    in_transit: "In Transit", delivered: "Delivered", refunded: "Refunded",
    exchange_fulfilled: "Exchanged", rejected: "Rejected", archived: "Archived",
  };
  return m[s] || s;
}

export default function AdminReturnDetail() {
  const { returnReq, auditLogs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [awbInput, setAwbInput] = useState("");
  const [utrInput, setUtrInput] = useState("");

  const r = returnReq as any;
  const items = (r.items || []) as any[];

  const prefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
  const displayId = `${prefix}-${(r.reqId || "").slice(-6).toUpperCase()}`;

  const doAction = (intent: string, extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.set("intent", intent);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    submit(fd, { method: "post" });
  };

  return (
    <>
      <Link to="/admin/returns" className="admin-back">← All Returns</Link>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{displayId} — Order #{r.orderNumber || r.orderId}</h1>
          <p className="admin-page-subtitle">{r.customerName || ""} {r.customerEmail ? `• ${r.customerEmail}` : ""}</p>
        </div>
        <span className={`admin-badge ${r.status}`} style={{ fontSize: 14, padding: "6px 14px" }}>
          {statusLabel(r.status)}
        </span>
      </div>

      <div className="admin-two-col">
        {/* Main Column */}
        <div>
          {/* Order Info */}
          <div className="admin-card">
            <h3 className="admin-card-title">Order Details</h3>
            <hr className="admin-divider" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
              <div>
                <div className="admin-item-meta">Order ID</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.orderId}</div>
              </div>
              <div>
                <div className="admin-item-meta">Order #</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>#{r.orderNumber}</div>
              </div>
              <div>
                <div className="admin-item-meta">Customer</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.customerName || "—"}</div>
              </div>
              <div>
                <div className="admin-item-meta">Type</div>
                <span className={`admin-badge ${r.requestType}`}>{r.requestType}</span>
              </div>
            </div>
            {r.isCod && (
              <div className="admin-banner warning" style={{ marginTop: 12 }}>
                This is a Cash on Delivery order
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="admin-card">
            <h3 className="admin-card-title">Items ({items.length})</h3>
            <hr className="admin-divider" />
            {items.map((item: any, idx: number) => (
              <div className="admin-item-row" key={idx}>
                {item.image_url && <img className="admin-item-img" src={item.image_url} alt={item.title} />}
                <div className="admin-item-info">
                  <div className="admin-item-title">{item.title}</div>
                  <div className="admin-item-meta">
                    {item.variant_title || ""} · Qty: {item.qty || 1}
                    {item.reason && ` · Reason: ${item.reason}`}
                  </div>
                  {item.exchange_variant_title && (
                    <div className="admin-item-meta" style={{ color: "var(--admin-info)" }}>
                      Exchange to: {item.exchange_variant_title}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="admin-item-price">₹{item.price}</div>
                  <span className={`admin-badge ${item.action}`} style={{ marginTop: 4 }}>{item.action}</span>
                </div>
              </div>
            ))}
            <hr className="admin-divider" />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Total</span>
              <span>₹{Number(r.totalPrice).toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Audit Log */}
          <div className="admin-card">
            <h3 className="admin-card-title">Audit Log</h3>
            <hr className="admin-divider" />
            {auditLogs.length === 0 ? (
              <p style={{ color: "var(--admin-text-muted)", fontSize: 14 }}>No audit entries yet.</p>
            ) : (
              <ul className="admin-timeline">
                {auditLogs.map((log: any) => (
                  <li className="admin-timeline-item" key={log.id}>
                    <div>
                      <div className="admin-timeline-action">{log.action}</div>
                      <div className="admin-timeline-details">{log.details || ""} — {log.actor || "system"}</div>
                    </div>
                    <span className="admin-timeline-date">{new Date(log.createdAt).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div>
          {/* Actions */}
          <div className="admin-card">
            <h3 className="admin-card-title">Actions</h3>
            <hr className="admin-divider" />
            {r.refundMethod && (
              <p style={{ fontSize: 13, color: "var(--admin-text-muted)", marginBottom: 12 }}>
                Refund: {r.refundMethod === "store_credit" ? "Store Credit" : "Original Payment"}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {r.status === "pending" && (
                <>
                  <button className="admin-btn admin-btn-success" onClick={() => doAction("approve")} disabled={isLoading}>
                    {isLoading ? "..." : "✓ Approve"}
                  </button>
                  <button className="admin-btn admin-btn-danger" onClick={() => doAction("reject")} disabled={isLoading}>
                    {isLoading ? "..." : "✗ Reject"}
                  </button>
                </>
              )}
              {r.status === "approved" && !r.awb && (
                <button className="admin-btn admin-btn-primary" onClick={() => doAction("create_pickup")} disabled={isLoading}>
                  {isLoading ? "..." : "🚚 Create Pickup"}
                </button>
              )}
              {["delivered", "pickup_scheduled", "in_transit"].includes(r.status) && (
                <>
                  {r.requestType !== "exchange" && !r.refundId && (
                    <button className="admin-btn admin-btn-success" onClick={() => doAction("process_refund")} disabled={isLoading}>
                      {isLoading ? "..." : "💰 Process Refund"}
                    </button>
                  )}
                  {(r.requestType === "exchange" || r.requestType === "mixed") && !r.exchangeOrderId && (
                    <button className="admin-btn admin-btn-primary" onClick={() => doAction("create_exchange")} disabled={isLoading}>
                      {isLoading ? "..." : "🔄 Create Exchange Order"}
                    </button>
                  )}
                </>
              )}
              {r.status !== "archived" && r.status !== "pending" && (
                <button className="admin-btn" onClick={() => doAction("archive")} disabled={isLoading}>
                  📁 Archive
                </button>
              )}
              {r.status === "archived" && (
                <button className="admin-btn" onClick={() => doAction("unarchive")} disabled={isLoading}>
                  📂 Unarchive
                </button>
              )}
            </div>
          </div>

          {/* Tracking */}
          <div className="admin-card">
            <h3 className="admin-card-title">Tracking</h3>
            <hr className="admin-divider" />
            {r.awb ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>AWB</span>
                  <span style={{ fontWeight: 600 }}>{r.awb}</span>
                </div>
                {r.awbStatus && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Status</span>
                    <span>{r.awbStatus}</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "var(--admin-text-muted)", marginBottom: 8 }}>No AWB attached.</p>
                <input
                  className="admin-input"
                  placeholder="Enter AWB number"
                  value={awbInput}
                  onChange={(e) => setAwbInput(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <button
                  className="admin-btn admin-btn-sm"
                  onClick={() => doAction("attach_awb", { awb: awbInput })}
                  disabled={!awbInput || isLoading}
                >
                  Attach AWB
                </button>
              </div>
            )}
          </div>

          {/* Exchange Order */}
          {r.exchangeOrderId && (
            <div className="admin-card">
              <h3 className="admin-card-title">Exchange Order</h3>
              <hr className="admin-divider" />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Our #</span>
                <span style={{ fontWeight: 600 }}>{r.exchangeOrderName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Shopify</span>
                <span>{r.exchangeShopifyName}</span>
              </div>
            </div>
          )}

          {/* Refund Info */}
          {r.refundId && (
            <div className="admin-card">
              <h3 className="admin-card-title">Refund</h3>
              <hr className="admin-divider" />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>Amount</span>
                <span style={{ fontWeight: 700 }}>₹{Number(r.refundAmount).toLocaleString("en-IN")}</span>
              </div>
              {r.utrNumber ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>UTR</span>
                  <span>{r.utrNumber}</span>
                </div>
              ) : (
                <div>
                  <input
                    className="admin-input"
                    placeholder="Enter UTR number"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => doAction("add_utr", { utr: utrInput })}
                    disabled={!utrInput || isLoading}
                  >
                    Add UTR
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
