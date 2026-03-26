import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);

  const [total, pending, approved, refunded, exchanged, rejected] =
    await Promise.all([
      prisma.returnRequest.count({ where: { shop } }),
      prisma.returnRequest.count({ where: { shop, status: "pending" } }),
      prisma.returnRequest.count({ where: { shop, status: "approved" } }),
      prisma.returnRequest.count({ where: { shop, status: "refunded" } }),
      prisma.returnRequest.count({ where: { shop, status: "exchange_fulfilled" } }),
      prisma.returnRequest.count({ where: { shop, status: "rejected" } }),
    ]);

  const recent = await prisma.returnRequest.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const activeRequests = await prisma.returnRequest.findMany({
    where: { shop, status: { notIn: ["archived", "rejected"] } },
    select: { totalPrice: true },
  });
  const revenueAtRisk = activeRequests.reduce(
    (sum, r) => sum + Number(r.totalPrice),
    0,
  );

  return json({ stats: { total, pending, approved, refunded, exchanged, rejected }, recent, revenueAtRisk });
};

function getReturnId(r: any) {
  const prefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
  const num = r.reqNum ? String(r.reqNum).padStart(3, "0") : (r.reqId || "").slice(-6).toUpperCase();
  return `${prefix}-${num}`;
}

export default function AdminDashboard() {
  const { stats, recent, revenueAtRisk } = useLoaderData<typeof loader>();

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Dashboard</h1>
          <p className="admin-page-subtitle">Overview of your return requests</p>
        </div>
      </div>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Total Requests</div>
          <div className="admin-stat-value">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Pending</div>
          <div className="admin-stat-value warning">{stats.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Approved</div>
          <div className="admin-stat-value info">{stats.approved}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Revenue at Risk</div>
          <div className="admin-stat-value danger">₹{revenueAtRisk.toLocaleString("en-IN")}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Refunded</div>
          <div className="admin-stat-value success">{stats.refunded}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Exchanges Fulfilled</div>
          <div className="admin-stat-value accent">{stats.exchanged}</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Recent Requests</h2>
          <Link to="/app/returns" className="admin-btn admin-btn-sm">View All</Link>
        </div>

        {recent.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">📦</div>
            <div className="admin-empty-text">No return requests yet</div>
            <div className="admin-empty-sub">They will appear here when customers submit returns.</div>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Return ID</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Status</th>
                <th>Value</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r: any) => (
                <tr key={r.reqId} className="clickable" onClick={() => window.location.href = `/admin/return/${r.reqId}`}>
                  <td style={{ fontWeight: 600 }}>{getReturnId(r)}</td>
                  <td>#{r.orderNumber || r.orderId}</td>
                  <td>{r.customerName || "—"}</td>
                  <td><span className={`admin-badge ${r.requestType}`}>{r.requestType}</span></td>
                  <td><span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span></td>
                  <td>₹{Number(r.totalPrice).toLocaleString("en-IN")}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Pending", approved: "Approved", pickup_scheduled: "Pickup Scheduled",
    in_transit: "In Transit", delivered: "Delivered", refunded: "Refunded",
    exchange_fulfilled: "Exchanged", rejected: "Rejected", archived: "Archived",
  };
  return map[status] || status;
}
