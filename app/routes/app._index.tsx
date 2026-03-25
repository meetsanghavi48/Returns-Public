import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest } from "../services/returns.server";

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { id: "pending", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "in_transit", label: "In Transit" },
  { id: "delivered", label: "Received" },
  { id: "refunded", label: "Refunded" },
  { id: "archived", label: "Archived" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

const STATUS_MAP: Record<string, string> = {
  pending: "pending", requested: "pending", approved: "approved",
  pickup_scheduled: "pickup_scheduled", in_transit: "in_transit",
  delivered: "delivered", received: "delivered", refunded: "refunded",
  exchanged: "exchange_fulfilled", exchange_fulfilled: "exchange_fulfilled",
  rejected: "rejected", archived: "archived",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Requested", approved: "Approved", pickup_scheduled: "Pickup Scheduled",
  in_transit: "In Transit", delivered: "Received", refunded: "Refunded",
  exchange_fulfilled: "Exchanged", rejected: "Rejected", archived: "Archived",
};

function getDateFilter(range: string): { gte?: Date } | undefined {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case "today": return { gte: start };
    case "7d": { start.setDate(start.getDate() - 7); return { gte: start }; }
    case "30d": { start.setDate(start.getDate() - 30); return { gte: start }; }
    default: return undefined;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const search = url.searchParams.get("search") || "";
  const dateRange = url.searchParams.get("dateRange") || "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const sw = { shop, createdAt: { gte: d30 } };

  const [totalReturns, pendingCount, inTransitCount, refundedAgg] = await Promise.all([
    prisma.returnRequest.count({ where: sw }),
    prisma.returnRequest.count({ where: { ...sw, status: "pending" } }),
    prisma.returnRequest.count({ where: { ...sw, status: "in_transit" } }),
    prisma.returnRequest.aggregate({
      where: { ...sw, refundAmount: { not: null } },
      _sum: { refundAmount: true },
    }),
  ]);

  const where: any = { shop };
  if (status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { reqId: { contains: search } },
      { orderNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  const df = getDateFilter(dateRange);
  if (df) where.createdAt = df;

  const totalCount = await prisma.returnRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      reqId: true, reqNum: true, orderId: true, orderNumber: true,
      customerName: true, customerEmail: true, status: true,
      requestType: true, items: true, totalPrice: true, createdAt: true,
    },
  });

  return json({
    stats: { totalReturns, pendingCount, inTransitCount, totalRefunded: Number(refundedAgg._sum.refundAmount || 0) },
    returns: returns.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    pagination: { currentPage, totalPages, totalCount, hasNext: currentPage < totalPages, hasPrev: currentPage > 1 },
    filters: { status, search, dateRange },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqIds = (formData.get("reqIds") as string || "").split(",").filter(Boolean);
  if (intent === "bulk_approve") {
    for (const id of reqIds) await approveRequest(session.shop, session.accessToken!, id);
  } else if (intent === "bulk_reject") {
    for (const id of reqIds) await rejectRequest(session.shop, session.accessToken!, id, "Bulk rejection");
  }
  return json({ ok: true });
};

export default function Dashboard() {
  const { stats, returns, pagination, filters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      if (!("page" in updates)) params.delete("page");
      return params;
    });
  }, [setSearchParams]);

  const formatCurrency = (n: number) =>
    "\u20B9" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const getReturnId = (r: any) => {
    const pfx = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
    const num = r.reqNum ? String(r.reqNum).padStart(3, "0") : (r.reqId || "").slice(-6).toUpperCase();
    return `${pfx}-${num}`;
  };

  const getFirstItem = (r: any) => {
    const items = Array.isArray(r.items) ? r.items : [];
    if (items.length === 0) return { title: "\u2014", image: null };
    return { title: items[0].title || "Item", image: items[0].image_url || items[0].image || null };
  };

  return (
    <>
      {/* Header */}
      <div className="admin-page-header">
        <h1 className="admin-page-title">Dashboard</h1>
        <Link to="/app/returns/new" className="admin-btn admin-btn-primary">
          + Create new request
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Total Returns (30d)</div>
          <div className="admin-stat-value">{stats.totalReturns}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Pending Approval</div>
          <div className={`admin-stat-value ${stats.pendingCount > 0 ? "warning" : ""}`}>{stats.pendingCount}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">In Transit</div>
          <div className="admin-stat-value info">{stats.inTransitCount}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Refunded Amount</div>
          <div className="admin-stat-value success">{formatCurrency(stats.totalRefunded)}</div>
        </div>
      </div>

      {/* Main Card */}
      <div className="admin-card" style={{ padding: 0 }}>
        {/* Status Tabs */}
        <div className="admin-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`admin-tab ${tab.id === filters.status ? "active" : ""}`}
              onClick={() => updateParams({ status: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Date Filter */}
        <div className="admin-search" style={{ padding: "12px 16px", marginBottom: 0 }}>
          <input
            className="admin-input"
            type="text"
            placeholder="Search with request id or order id"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") updateParams({ search: searchValue || null }); }}
          />
          <button className="admin-btn admin-btn-primary" onClick={() => updateParams({ search: searchValue || null })}>
            Search
          </button>
          <select
            className="admin-select"
            style={{ width: "auto", minWidth: "140px" }}
            value={filters.dateRange}
            onChange={(e) => updateParams({ dateRange: e.target.value === "all" ? null : e.target.value })}
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {returns.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">{"\uD83D\uDCE6"}</div>
            <div className="admin-empty-text">No returns found</div>
            <div className="admin-empty-sub">
              {filters.search ? "Try adjusting your search or filters." : "Returns will appear here when customers submit them."}
            </div>
          </div>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r: any) => {
                  const item = getFirstItem(r);
                  const statusKey = STATUS_MAP[r.status] || r.status;
                  return (
                    <tr
                      key={r.reqId}
                      className="clickable"
                      onClick={() => navigate(`/app/returns/${r.reqId}`)}
                    >
                      <td>
                        <strong>{getReturnId(r)}</strong>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {item.image ? (
                            <img src={item.image} alt="" className="admin-item-img" style={{ width: 32, height: 32 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{"\uD83D\uDCE6"}</div>
                          )}
                          <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                        </div>
                      </td>
                      <td>#{r.orderNumber || r.orderId}</td>
                      <td style={{ color: "#6b7280" }}>{r.customerEmail || r.customerName || "\u2014"}</td>
                      <td>
                        <span className={`admin-badge ${statusKey}`}>
                          {STATUS_LABEL[statusKey] || r.status}
                        </span>
                      </td>
                      <td style={{ color: "#6b7280" }}>
                        {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: 14, borderTop: "1px solid var(--admin-border)" }}>
                <button
                  className="admin-btn admin-btn-sm"
                  onClick={() => updateParams({ page: String(pagination.currentPage - 1) })}
                  disabled={!pagination.hasPrev}
                >
                  {"\u2190"} Prev
                </button>
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>
                <button
                  className="admin-btn admin-btn-sm"
                  onClick={() => updateParams({ page: String(pagination.currentPage + 1) })}
                  disabled={!pagination.hasNext}
                >
                  Next {"\u2192"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
