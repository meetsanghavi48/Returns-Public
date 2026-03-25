import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useCallback } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

const DATE_OPTIONS = [
  { id: "today", label: "Today", days: 0 },
  { id: "7days", label: "Last 7 Days", days: 7 },
  { id: "30days", label: "Last 30 Days", days: 30 },
  { id: "90days", label: "Last 90 Days", days: 90 },
];

function getDateRange(preset: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;
  let days: number;

  if (preset === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    days = 1;
  } else if (preset === "7days") {
    start = new Date(now.getTime() - 7 * 86400000);
    days = 7;
  } else if (preset === "90days") {
    start = new Date(now.getTime() - 90 * 86400000);
    days = 90;
  } else {
    start = new Date(now.getTime() - 30 * 86400000);
    days = 30;
  }

  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - days * 86400000);
  return { start, end, prevStart, prevEnd };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30days";
  const typeFilter = url.searchParams.get("type") || "both";

  const { start, end, prevStart, prevEnd } = getDateRange(period);

  const typeWhere: any = {};
  if (typeFilter === "returns") typeWhere.requestType = "return";
  if (typeFilter === "exchanges") typeWhere.requestType = "exchange";

  // Current period data
  const currentReturns = await prisma.returnRequest.findMany({
    where: { shop, createdAt: { gte: start, lte: end }, ...typeWhere },
    orderBy: { createdAt: "asc" },
  });

  // Previous period data
  const prevReturns = await prisma.returnRequest.findMany({
    where: { shop, createdAt: { gte: prevStart, lte: prevEnd }, ...typeWhere },
  });

  // Compute stats
  const currentCount = currentReturns.length;
  const prevCount = prevReturns.length;
  const currentValue = currentReturns.reduce((s, r) => s + Number(r.totalPrice), 0);
  const prevValue = prevReturns.reduce((s, r) => s + Number(r.totalPrice), 0);
  const revenueSaved = currentReturns.filter((r) => r.status === "rejected" || r.requestType === "exchange").reduce((s, r) => s + Number(r.totalPrice), 0);
  const prevRevenueSaved = prevReturns.filter((r) => r.status === "rejected" || r.requestType === "exchange").reduce((s, r) => s + Number(r.totalPrice), 0);

  // Avg times
  const resolvedReturns = currentReturns.filter((r) => r.approvedAt);
  const avgResolveTime = resolvedReturns.length > 0
    ? resolvedReturns.reduce((s, r) => s + (new Date(r.approvedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / resolvedReturns.length / 86400000
    : 0;

  // Reasons breakdown
  const reasonCounts: Record<string, number> = {};
  for (const r of currentReturns) {
    const items = (r.items as any[]) || [];
    for (const item of items) {
      const reason = item.reason || "Not specified";
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Products breakdown
  const productCounts: Record<string, number> = {};
  for (const r of currentReturns) {
    const items = (r.items as any[]) || [];
    for (const item of items) {
      const name = item.title || "Unknown";
      productCounts[name] = (productCounts[name] || 0) + (parseInt(item.qty) || 1);
    }
  }
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Payment type breakdown
  const prepaidCount = currentReturns.filter((r) => !r.isCod).length;
  const codCount = currentReturns.filter((r) => r.isCod).length;

  // Refund modes
  const refundModes: Record<string, { count: number; amount: number }> = {};
  for (const r of currentReturns) {
    const mode = r.refundMethod || "not_set";
    if (!refundModes[mode]) refundModes[mode] = { count: 0, amount: 0 };
    refundModes[mode].count++;
    refundModes[mode].amount += Number(r.refundAmount || 0);
  }

  // Exchange breakdown
  const exchangeWithVariant = currentReturns.filter((r) => r.requestType === "exchange").length;
  const exchangeWithDiff = currentReturns.filter((r) => r.requestType === "mixed").length;

  // Auto-actions
  const autoApproved = currentReturns.filter((r) => r.autoAction === "auto_approved").length;
  const autoRejected = currentReturns.filter((r) => r.autoAction === "auto_rejected").length;
  const autoRefunded = currentReturns.filter((r) => r.autoAction === "auto_refunded").length;

  // Top customers
  const customerMap: Record<string, { email: string; orders: Set<string>; requests: number; value: number }> = {};
  for (const r of currentReturns) {
    const email = r.customerEmail || "unknown";
    if (!customerMap[email]) customerMap[email] = { email, orders: new Set(), requests: 0, value: 0 };
    customerMap[email].orders.add(r.orderId);
    customerMap[email].requests++;
    customerMap[email].value += Number(r.totalPrice);
  }
  const topCustomers = Object.values(customerMap)
    .map((c) => ({ email: c.email, orders: c.orders.size, requests: c.requests, value: c.value }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  // Daily chart data
  const dailyData: Record<string, number> = {};
  const prevDailyData: Record<string, number> = {};
  for (const r of currentReturns) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    dailyData[day] = (dailyData[day] || 0) + 1;
  }
  for (const r of prevReturns) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    prevDailyData[day] = (prevDailyData[day] || 0) + 1;
  }

  // Logistics partners
  const logisticsCounts: Record<string, number> = {};
  for (const r of currentReturns) {
    if (r.awb) {
      const partner = r.awbStatus || "Unknown";
      logisticsCounts[partner] = (logisticsCounts[partner] || 0) + 1;
    }
  }

  return json({
    period,
    typeFilter,
    stats: {
      currentCount, prevCount,
      currentValue, prevValue,
      revenueSaved, prevRevenueSaved,
      avgResolveTime: Math.round(avgResolveTime * 10) / 10,
    },
    topReasons,
    topProducts,
    prepaidCount,
    codCount,
    refundModes,
    exchangeWithVariant,
    exchangeWithDiff,
    autoApproved,
    autoRejected,
    autoRefunded,
    topCustomers,
    dailyData,
    prevDailyData,
    logisticsCounts,
  });
};

function pctChange(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "0%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
}

function pctColor(current: number, prev: number): string {
  if (current > prev) return "var(--admin-danger)";
  if (current < prev) return "var(--admin-success)";
  return "#888";
}

export default function AdminAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handlePeriod = useCallback((period: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", period);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleType = useCallback((type: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("type", type);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const { stats } = data;
  const totalReasons = data.topReasons.reduce((s, [, c]) => s + c, 0);
  const totalProducts = data.topProducts.reduce((s, [, c]) => s + c, 0);
  const totalPayment = data.prepaidCount + data.codCount;

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Analytics</h1>
          <p className="admin-page-subtitle">Compare to: previous period</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["both", "returns", "exchanges"].map((t) => (
              <button key={t} className={`admin-btn admin-btn-sm ${data.typeFilter === t ? "admin-btn-primary" : ""}`} onClick={() => handleType(t)} style={{ textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>
          <select className="admin-input" value={data.period} onChange={(e) => handlePeriod(e.target.value)} style={{ width: 160 }}>
            {DATE_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      {/* Stats cards */}
      <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 32 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Requests raised</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="admin-stat-value">{stats.currentCount}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(stats.currentCount, stats.prevCount) }}>
              {pctChange(stats.currentCount, stats.prevCount)}
            </span>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Requests value</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="admin-stat-value">{"\u20B9"}{stats.currentValue.toLocaleString("en-IN")}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(stats.currentValue, stats.prevValue) }}>
              {pctChange(stats.currentValue, stats.prevValue)}
            </span>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Revenue saved</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="admin-stat-value success">{"\u20B9"}{stats.revenueSaved.toLocaleString("en-IN")}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(stats.revenueSaved, stats.prevRevenueSaved) }}>
              {pctChange(stats.revenueSaved, stats.prevRevenueSaved)}
            </span>
          </div>
        </div>
      </div>

      {/* Time metrics */}
      <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 32 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Avg Time to Resolve</div>
          <div className="admin-stat-value">{stats.avgResolveTime} days</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Request Volume</div>
          <div className="admin-stat-value">{stats.currentCount}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Refund Total</div>
          <div className="admin-stat-value">{"\u20B9"}{Object.values(data.refundModes).reduce((s, m) => s + m.amount, 0).toLocaleString("en-IN")}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Exchanges</div>
          <div className="admin-stat-value">{data.exchangeWithVariant + data.exchangeWithDiff}</div>
        </div>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Top Products */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Request volume by products</h3></div>
          <div style={{ padding: 16 }}>
            {data.topProducts.length === 0 ? <p style={{ color: "#999", fontSize: 13 }}>No data</p> : data.topProducts.map(([name, count]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span style={{ color: "#888" }}>{count} ({totalProducts > 0 ? Math.round(count / totalProducts * 100) : 0}%)</span>
                </div>
                <div style={{ background: "#e5e7eb", borderRadius: 4, height: 8 }}>
                  <div style={{ background: "var(--admin-accent)", borderRadius: 4, height: 8, width: `${totalProducts > 0 ? (count / totalProducts * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Reasons */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Top request reasons</h3></div>
          <div style={{ padding: 16 }}>
            {data.topReasons.length === 0 ? <p style={{ color: "#999", fontSize: 13 }}>No data</p> : data.topReasons.map(([reason, count], i) => {
              const colors = ["#6c5ce7", "#00b894", "#fdcb6e", "#e17055", "#74b9ff", "#a29bfe", "#55efc4", "#fab1a0", "#81ecec", "#dfe6e9"];
              return (
                <div key={reason} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: colors[i % colors.length] }} />
                    <span style={{ fontSize: 13 }}>{reason}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#888" }}>{count} ({totalReasons > 0 ? Math.round(count / totalReasons * 100) : 0}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Payment types */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Requests by payment methods</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 24 }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--admin-accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", color: "#fff", fontWeight: 700, fontSize: 18 }}>
                  {totalPayment > 0 ? Math.round(data.prepaidCount / totalPayment * 100) : 0}%
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Prepaid</div>
                <div style={{ color: "#888", fontSize: 13 }}>{data.prepaidCount} requests</div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--admin-warning)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", color: "#fff", fontWeight: 700, fontSize: 18 }}>
                  {totalPayment > 0 ? Math.round(data.codCount / totalPayment * 100) : 0}%
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>COD</div>
                <div style={{ color: "#888", fontSize: 13 }}>{data.codCount} requests</div>
              </div>
            </div>
          </div>
        </div>

        {/* Refund modes */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Refund by payment modes</h3></div>
          <div style={{ padding: 16 }}>
            {Object.entries(data.refundModes).length === 0 ? <p style={{ color: "#999", fontSize: 13 }}>No data</p> : Object.entries(data.refundModes).map(([mode, info]) => (
              <div key={mode} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{mode.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 13 }}>{info.count} | {"\u20B9"}{info.amount.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Exchanges */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Exchanges</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#888" }}>With Variants</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{data.exchangeWithVariant}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#888" }}>With Different Products</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{data.exchangeWithDiff}</div>
            </div>
          </div>
        </div>

        {/* Automation */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Automation</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Auto Approved: </span>
              <span style={{ fontWeight: 700, color: "var(--admin-success)" }}>{data.autoApproved}</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Auto Rejected: </span>
              <span style={{ fontWeight: 700, color: "var(--admin-danger)" }}>{data.autoRejected}</span>
            </div>
            <div>
              <span style={{ fontSize: 13 }}>Auto Refunded: </span>
              <span style={{ fontWeight: 700, color: "var(--admin-info)" }}>{data.autoRefunded}</span>
            </div>
          </div>
        </div>

        {/* Daily trend (text-based) */}
        <div className="admin-card">
          <div className="admin-card-header"><h3 className="admin-card-title">Daily Trend</h3></div>
          <div style={{ padding: 16, maxHeight: 200, overflow: "auto" }}>
            {Object.keys(data.dailyData).length === 0 ? <p style={{ color: "#999", fontSize: 13 }}>No data</p> :
              Object.entries(data.dailyData).sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => (
                <div key={date} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#888" }}>{new Date(date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Top customers */}
      <div className="admin-card" style={{ marginBottom: 32 }}>
        <div className="admin-card-header"><h3 className="admin-card-title">Top customers raising requests</h3></div>
        {data.topCustomers.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>No data available</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Customer Email</th>
                <th>Orders</th>
                <th>Requests</th>
                <th>Return Value</th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c) => (
                <tr key={c.email}>
                  <td style={{ fontWeight: 500 }}>{c.email}</td>
                  <td>{c.orders}</td>
                  <td>{c.requests}</td>
                  <td>{"\u20B9"}{c.value.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
