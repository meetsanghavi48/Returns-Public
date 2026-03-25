import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
  Link,
} from "@remix-run/react";
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

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E", label: "Requested" },
  requested: { bg: "#FEF3C7", color: "#92400E", label: "Requested" },
  approved: { bg: "#DBEAFE", color: "#1E40AF", label: "Approved" },
  pickup_scheduled: { bg: "#DBEAFE", color: "#1E40AF", label: "Pickup Scheduled" },
  in_transit: { bg: "#EDE9FE", color: "#5B21B6", label: "In Transit" },
  delivered: { bg: "#D1FAE5", color: "#065F46", label: "Received" },
  received: { bg: "#D1FAE5", color: "#065F46", label: "Received" },
  refunded: { bg: "#D1FAE5", color: "#065F46", label: "Refunded" },
  exchanged: { bg: "#D1FAE5", color: "#065F46", label: "Exchanged" },
  rejected: { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
  archived: { bg: "#F3F4F6", color: "#374151", label: "Archived" },
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

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || { bg: "#F3F4F6", color: "#374151", label: status };
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: 500,
      backgroundColor: s.bg,
      color: s.color,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      flex: "1 1 0",
      minWidth: "180px",
      background: "#fff",
      borderRadius: "10px",
      padding: "18px 20px",
      border: "1px solid #e8e8e8",
    }}>
      <div style={{ fontSize: "12.5px", color: "#777", marginBottom: "6px" }}>{label}</div>
      <div style={{
        fontSize: "26px",
        fontWeight: 700,
        color: accent ? "#e51c00" : "#1a1a1a",
      }}>
        {value}
      </div>
    </div>
  );
}

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
    if (items.length === 0) return { title: "—", image: null };
    return { title: items[0].title || "Item", image: items[0].image_url || items[0].image || null };
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Dashboard</h1>
        <Link
          to="/app/returns/new"
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "8px",
            background: "#1a1a1a", color: "#fff",
            fontSize: "13.5px", fontWeight: 500,
            textDecoration: "none",
          }}
        >
          + Create new request
        </Link>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "22px", flexWrap: "wrap" }}>
        <StatCard label="Total Returns (30d)" value={stats.totalReturns} />
        <StatCard label="Pending Approval" value={stats.pendingCount} accent={stats.pendingCount > 0} />
        <StatCard label="In Transit" value={stats.inTransitCount} />
        <StatCard label="Refunded Amount" value={formatCurrency(stats.totalRefunded)} />
      </div>

      {/* Main Card */}
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", overflow: "hidden" }}>
        {/* Status Tabs */}
        <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #eee", overflowX: "auto" }}>
          {STATUS_TABS.map((tab) => {
            const active = tab.id === filters.status;
            return (
              <button
                key={tab.id}
                onClick={() => updateParams({ status: tab.id })}
                style={{
                  padding: "13px 18px",
                  fontSize: "13px",
                  fontWeight: active ? 600 : 400,
                  color: active ? "#1a1a1a" : "#777",
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid #1a1a1a" : "2px solid transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search + Date Filter */}
        <div style={{ display: "flex", gap: "10px", padding: "14px 18px", alignItems: "center", borderBottom: "1px solid #f3f3f3" }}>
          <div style={{ flex: 1, display: "flex", gap: "0" }}>
            <input
              type="text"
              placeholder="Search with request id or order id"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") updateParams({ search: searchValue || null }); }}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRight: "none",
                borderRadius: "6px 0 0 6px",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              onClick={() => updateParams({ search: searchValue || null })}
              style={{
                padding: "8px 16px",
                background: "#1a1a1a",
                color: "#fff",
                border: "none",
                borderRadius: "0 6px 6px 0",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Search
            </button>
          </div>
          <select
            value={filters.dateRange}
            onChange={(e) => updateParams({ dateRange: e.target.value === "all" ? null : e.target.value })}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "13px",
              background: "#fff",
              color: "#333",
              cursor: "pointer",
            }}
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {returns.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.3 }}>{"\uD83D\uDCE6"}</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#333", marginBottom: "6px" }}>No returns found</div>
            <div style={{ fontSize: "13px", color: "#888" }}>
              {filters.search ? "Try adjusting your search or filters." : "Returns will appear here when customers submit them."}
            </div>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r: any) => {
                  const item = getFirstItem(r);
                  return (
                    <tr
                      key={r.reqId}
                      onClick={() => navigate(`/app/returns/${r.reqId}`)}
                      style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fafafa")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{getReturnId(r)}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {item.image ? (
                            <img src={item.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", border: "1px solid #eee" }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 4, background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>{"\uD83D\uDCE6"}</div>
                          )}
                          <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>#{r.orderNumber || r.orderId}</td>
                      <td style={{ ...tdStyle, color: "#666" }}>{r.customerEmail || r.customerName || "\u2014"}</td>
                      <td style={tdStyle}><StatusPill status={r.status} /></td>
                      <td style={{ ...tdStyle, color: "#888" }}>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", padding: "14px" }}>
                <button
                  onClick={() => updateParams({ page: String(pagination.currentPage - 1) })}
                  disabled={!pagination.hasPrev}
                  style={paginationBtnStyle(!pagination.hasPrev)}
                >
                  {"\u2190"} Prev
                </button>
                <span style={{ fontSize: "13px", color: "#666" }}>
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => updateParams({ page: String(pagination.currentPage + 1) })}
                  disabled={!pagination.hasNext}
                  style={paginationBtnStyle(!pagination.hasNext)}
                >
                  Next {"\u2192"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "11px 16px",
  fontSize: "12px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "middle",
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: "13px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    background: disabled ? "#f9f9f9" : "#fff",
    color: disabled ? "#ccc" : "#333",
    cursor: disabled ? "default" : "pointer",
    fontWeight: 500,
  };
}
