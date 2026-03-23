import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest } from "../services/returns.server";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "pickup_scheduled", label: "Pickup Scheduled" },
  { id: "delivered", label: "Delivered" },
  { id: "refunded", label: "Refunded" },
  { id: "archived", label: "Archived" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";

  const where: any = { shop };
  if (status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { reqId: { contains: search } },
    ];
  }

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const counts: Record<string, number> = {};
  for (const tab of STATUS_TABS) {
    if (tab.id === "all") {
      counts.all = await prisma.returnRequest.count({ where: { shop } });
    } else {
      counts[tab.id] = await prisma.returnRequest.count({ where: { shop, status: tab.id } });
    }
  }

  return json({ returns, counts, status, search });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, accessToken } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqIds = (formData.get("reqIds") as string || "").split(",").filter(Boolean);

  if (intent === "bulk_approve") {
    for (const reqId of reqIds) await approveRequest(shop, accessToken, reqId);
  } else if (intent === "bulk_reject") {
    for (const reqId of reqIds) await rejectRequest(shop, accessToken, reqId, "Bulk rejection");
  }

  return json({ ok: true });
};

function getReturnId(r: any) {
  const prefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
  const num = r.reqNum ? String(r.reqNum).padStart(3, "0") : (r.reqId || "").slice(-6).toUpperCase();
  return `${prefix}-${num}`;
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    pending: "Pending", approved: "Approved", pickup_scheduled: "Pickup Scheduled",
    in_transit: "In Transit", delivered: "Delivered", refunded: "Refunded",
    exchange_fulfilled: "Exchanged", rejected: "Rejected", archived: "Archived",
  };
  return m[s] || s;
}

export default function AdminReturns() {
  const { returns, counts, status, search } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === returns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(returns.map((r: any) => r.reqId)));
    }
  };

  const handleTabChange = useCallback((tabId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("status", tabId);
    params.delete("search");
    setSearchParams(params);
    setSelected(new Set());
  }, [searchParams, setSearchParams]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    searchValue ? params.set("search", searchValue) : params.delete("search");
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  const handleBulk = (intent: string) => {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("reqIds", Array.from(selected).join(","));
    submit(formData, { method: "post" });
    setSelected(new Set());
  };

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Returns</h1>
        <button className="admin-btn admin-btn-primary" onClick={() => navigate("/admin/returns/new")}>
          + Create Return
        </button>
      </div>

      <div className="admin-card" style={{ padding: 0 }}>
        {/* Tabs */}
        <div className="admin-tabs" style={{ padding: "0 16px" }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`admin-tab ${status === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label} ({counts[tab.id] || 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "16px" }}>
          <div className="admin-search">
            <input
              className="admin-input"
              placeholder="Search by order number, customer name, or request ID..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button className="admin-btn" onClick={handleSearch}>Search</button>
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="admin-bulk-bar">
              <span className="admin-bulk-count">{selected.size} selected</span>
              <button className="admin-btn admin-btn-sm admin-btn-success" onClick={() => handleBulk("bulk_approve")}>Approve</button>
              <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleBulk("bulk_reject")}>Reject</button>
            </div>
          )}

          {/* Table */}
          {returns.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon">📦</div>
              <div className="admin-empty-text">No returns found</div>
              <div className="admin-empty-sub">{search ? "Try adjusting your search." : "Returns will appear here when customers submit them."}</div>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={selected.size === returns.length && returns.length > 0} onChange={toggleAll} />
                  </th>
                  <th>Return ID</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Value</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r: any) => {
                  const items = (r.items || []) as any[];
                  return (
                    <tr
                      key={r.reqId}
                      className={`clickable ${selected.has(r.reqId) ? "selected" : ""}`}
                      onClick={() => { window.location.href = `/admin/return/${r.reqId}`; }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(r.reqId)} onChange={() => toggleSelect(r.reqId)} />
                      </td>
                      <td><a href={`/admin/return/${r.reqId}`} style={{ fontWeight: 600, color: "var(--admin-accent)", textDecoration: "none" }}>{getReturnId(r)}</a></td>
                      <td>#{r.orderNumber || r.orderId}</td>
                      <td>{r.customerName || "—"}</td>
                      <td><span className={`admin-badge ${r.requestType}`}>{r.requestType}</span></td>
                      <td><span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span></td>
                      <td>{items.length} item{items.length !== 1 ? "s" : ""}</td>
                      <td>₹{Number(r.totalPrice).toLocaleString("en-IN")}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
