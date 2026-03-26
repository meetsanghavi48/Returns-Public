import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest } from "../services/returns.server";
import { shopifyREST } from "../services/shopify.server";
import { getCurrencySymbol, formatCurrency, formatAmount } from "~/utils/currency";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "pickup_scheduled", label: "Pickup Scheduled" },
  { id: "delivered", label: "Delivered" },
  { id: "refunded", label: "Refunded" },
  { id: "archived", label: "Archived" },
];

const DATE_PRESETS = [
  { id: "custom", label: "Custom" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7days", label: "Last 7 days" },
  { id: "30days", label: "Last 30 days" },
];

const FILTER_OPTIONS: Record<string, { label: string; values: string[] }> = {
  shipment_status: { label: "Shipment status", values: ["pending", "approved", "pickup_scheduled", "in_transit", "delivered", "refunded", "rejected", "archived"] },
  requested_refund: { label: "Requested refund mode", values: ["original", "store_credit", "bank_transfer", "exchange"] },
  request_type: { label: "Request type", values: ["return", "exchange", "mixed"] },
  payment_type: { label: "Order payment type", values: ["prepaid", "cod"] },
  refund_status: { label: "Refund status", values: ["pending", "processed", "failed"] },
  refund_shopify_credit: { label: "Refunded via Shopify store credit", values: ["Yes", "No"] },
  refund_razorpay: { label: "Refunded via Razorpay", values: ["Yes", "No"] },
  refund_gift_card: { label: "Refunded via Gift Card", values: ["Yes", "No"] },
  refund_discount: { label: "Refunded via Discount Code", values: ["Yes", "No"] },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, accessToken } = await requireAppAuth(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const q = url.searchParams.get("q") || "";
  const datePreset = url.searchParams.get("datePreset") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  // Collect active filters
  const activeFilters: Record<string, string> = {};
  for (const key of Object.keys(FILTER_OPTIONS)) {
    const val = url.searchParams.get(key);
    if (val) activeFilters[key] = val;
  }

  const where: any = { shop };
  if (status !== "all") where.status = status;

  // Search across multiple fields
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
      { awb: { contains: q, mode: "insensitive" } },
      { reqId: { contains: q } },
    ];
  }

  // Apply date filters
  if (datePreset || (dateFrom && dateTo)) {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    if (datePreset === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 86400000);
    } else if (datePreset === "yesterday") {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = new Date(end.getTime() - 86400000);
    } else if (datePreset === "7days") {
      end = new Date();
      start = new Date(end.getTime() - 7 * 86400000);
    } else if (datePreset === "30days") {
      end = new Date();
      start = new Date(end.getTime() - 30 * 86400000);
    } else if (dateFrom && dateTo) {
      start = new Date(dateFrom);
      end = new Date(dateTo + "T23:59:59.999Z");
    }
    if (start && end) {
      where.createdAt = { gte: start, lte: end };
    }
  }

  // Apply advanced filters
  if (activeFilters.shipment_status) where.status = activeFilters.shipment_status;
  if (activeFilters.requested_refund) where.refundMethod = activeFilters.requested_refund;
  if (activeFilters.request_type) where.requestType = activeFilters.request_type;
  if (activeFilters.payment_type) where.isCod = activeFilters.payment_type === "cod";

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

  // Load reasons for filter dropdown
  const reasons = await prisma.returnReason.findMany({ where: { shop }, select: { name: true } });

  let currency = "USD";
  try {
    const shopData = await shopifyREST(shop, accessToken, "GET", "shop.json?fields=currency");
    currency = shopData?.shop?.currency || "USD";
  } catch {}

  return json({ returns, counts, status, q, currency, reasons: reasons.map((r) => r.name), activeFilters, datePreset });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, accessToken } = await requireAppAuth(request);
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
  const { returns, counts, status, q, currency, reasons, activeFilters, datePreset } = useLoaderData<typeof loader>();
  const cs = getCurrencySymbol(currency);
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>(activeFilters || {});

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

  const applyParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    setSearchParams(params);
    setSelected(new Set());
  }, [searchParams, setSearchParams]);

  const handleTabChange = useCallback((tabId: string) => {
    applyParams({ status: tabId, q: null });
  }, [applyParams]);

  const handleSearch = useCallback(() => {
    applyParams({ q: searchValue || null });
  }, [searchValue, applyParams]);

  const clearSearch = useCallback(() => {
    setSearchValue("");
    applyParams({ q: null });
  }, [applyParams]);

  const addFilter = useCallback((key: string, value: string) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    applyParams({ [key]: value });
    setShowFilterDropdown(false);
  }, [filters, applyParams]);

  const removeFilter = useCallback((key: string) => {
    const updated = { ...filters };
    delete updated[key];
    setFilters(updated);
    applyParams({ [key]: null });
  }, [filters, applyParams]);

  const clearAllFilters = useCallback(() => {
    const updates: Record<string, null> = {};
    for (const key of Object.keys(filters)) updates[key] = null;
    updates.datePreset = null;
    updates.dateFrom = null;
    updates.dateTo = null;
    setFilters({});
    applyParams(updates);
  }, [filters, applyParams]);

  const handleDatePreset = useCallback((preset: string) => {
    if (preset === "custom") {
      applyParams({ datePreset: null });
    } else {
      applyParams({ datePreset: preset, dateFrom: null, dateTo: null });
    }
  }, [applyParams]);

  const handleBulk = (intent: string) => {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("reqIds", Array.from(selected).join(","));
    submit(formData, { method: "post" });
    setSelected(new Set());
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || datePreset;

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Returns</h1>
        <button className="admin-btn admin-btn-primary" onClick={() => navigate("/app/returns/new")}>
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

        <div style={{ padding: "16px" }}>
          {/* Search bar */}
          <div className="admin-search" style={{ marginBottom: 12 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                className="admin-input"
                placeholder="Search with request id or order id, email, phone, AWB..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                style={{ width: "100%", paddingRight: q ? 32 : undefined }}
              />
              {q && (
                <button onClick={clearSearch} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#999" }}>&times;</button>
              )}
            </div>
            <button className="admin-btn admin-btn-primary" onClick={handleSearch}>Search</button>
          </div>

          {/* Date filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {DATE_PRESETS.map((dp) => (
              <button
                key={dp.id}
                className={`admin-btn admin-btn-sm ${datePreset === dp.id ? "admin-btn-primary" : ""}`}
                onClick={() => handleDatePreset(dp.id)}
                style={{ fontSize: 12 }}
              >
                {dp.label}
              </button>
            ))}
          </div>

          {/* Filter controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ position: "relative" }}>
              <button className="admin-btn admin-btn-sm" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
                + Add filter
              </button>
              {showFilterDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", width: 280, maxHeight: 320, overflow: "auto" }}>
                  {Object.entries(FILTER_OPTIONS).map(([key, opt]) => (
                    <div key={key} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#888", background: "#fafafa" }}>{opt.label}</div>
                      {opt.values.map((val) => (
                        <button
                          key={val}
                          onClick={() => addFilter(key, val)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px 6px 20px", border: "none", background: filters[key] === val ? "#EFF6FF" : "transparent", cursor: "pointer", fontSize: 13 }}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  ))}
                  {/* Reason filter */}
                  {reasons.length > 0 && (
                    <div style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#888", background: "#fafafa" }}>Reason</div>
                      {reasons.map((name: string) => (
                        <button key={name} onClick={() => addFilter("reason", name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px 6px 20px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13 }}>
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Active filter pills */}
            {Object.entries(filters).map(([key, val]) => {
              const label = FILTER_OPTIONS[key]?.label || key;
              return (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#EFF6FF", color: "#1e40af", borderRadius: 16, padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>
                  {label}: {val}
                  <button onClick={() => removeFilter(key)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#1e40af", lineHeight: 1 }}>&times;</button>
                </span>
              );
            })}

            {hasActiveFilters && (
              <button onClick={clearAllFilters} style={{ background: "none", border: "none", color: "var(--admin-danger)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                Remove all filters
              </button>
            )}
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
              <div className="admin-empty-icon">&#128230;</div>
              <div className="admin-empty-text">No returns found</div>
              <div className="admin-empty-sub">{q ? "Try adjusting your search." : "Returns will appear here when customers submit them."}</div>
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
                      <td>{r.customerName || "\u2014"}</td>
                      <td><span className={`admin-badge ${r.requestType}`}>{r.requestType}</span></td>
                      <td><span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span></td>
                      <td>{items.length} item{items.length !== 1 ? "s" : ""}</td>
                      <td>{cs}{formatAmount(Number(r.totalPrice), currency)}</td>
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
