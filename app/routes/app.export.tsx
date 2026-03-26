import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7days", label: "Last 7 days" },
  { id: "30days", label: "Last 30 days" },
  { id: "90days", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

const DATA_TYPES = [
  { id: "returns", label: "Returns" },
  { id: "exchanges", label: "Exchanges" },
  { id: "refunds", label: "Refunds" },
  { id: "audit", label: "Audit logs" },
];

const CSV_COLUMNS = [
  "Request ID", "Order Number", "Customer Email", "Customer Phone", "Status",
  "Return Type", "Items", "Reasons", "Logistics Partner", "AWB Number",
  "Tracking URL", "Refund Method", "Refund Amount", "Created Date", "Updated Date",
  "Days to Resolve",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);

  // Get recent exports
  const recentExports = await prisma.returnRequest.findMany({
    where: { shop, exportedAt: { not: null } },
    orderBy: { exportedAt: "desc" },
    take: 10,
    select: { exportedAt: true, reqId: true },
  });

  const totalReturns = await prisma.returnRequest.count({ where: { shop } });

  return json({ recentExports, totalReturns });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "export") {
    const datePreset = formData.get("datePreset") as string;
    const dateFrom = formData.get("dateFrom") as string;
    const dateTo = formData.get("dateTo") as string;
    const dataTypes = JSON.parse(formData.get("dataTypes") as string || "[]") as string[];
    const columns = JSON.parse(formData.get("columns") as string || "[]") as string[];

    // Build date filter
    const now = new Date();
    let start: Date | null = null;
    const end = now;

    if (datePreset === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (datePreset === "7days") start = new Date(now.getTime() - 7 * 86400000);
    else if (datePreset === "30days") start = new Date(now.getTime() - 30 * 86400000);
    else if (datePreset === "90days") start = new Date(now.getTime() - 90 * 86400000);
    else if (dateFrom) start = new Date(dateFrom);

    const where: any = { shop };
    if (start) where.createdAt = { gte: start, lte: dateTo ? new Date(dateTo + "T23:59:59Z") : end };

    // Filter by type
    if (dataTypes.length > 0 && !dataTypes.includes("audit")) {
      const types: string[] = [];
      if (dataTypes.includes("returns")) types.push("return");
      if (dataTypes.includes("exchanges")) types.push("exchange", "mixed");
      if (types.length > 0) where.requestType = { in: types };
    }

    const returns = await prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Build CSV
    const useColumns = columns.length > 0 ? columns : CSV_COLUMNS;
    const csvRows: string[] = [useColumns.join(",")];

    for (const r of returns) {
      const items = (r.items as any[]) || [];
      const itemNames = items.map((i) => i.title || "").join("; ");
      const reasons = items.map((i) => i.reason || "").filter(Boolean).join("; ");
      const daysToResolve = r.approvedAt
        ? Math.round((new Date(r.approvedAt).getTime() - new Date(r.createdAt).getTime()) / 86400000)
        : "";

      const row: Record<string, string> = {
        "Request ID": r.reqId,
        "Order Number": r.orderNumber || r.orderId,
        "Customer Email": r.customerEmail || "",
        "Customer Phone": r.customerPhone || "",
        "Status": r.status,
        "Return Type": r.requestType,
        "Items": `"${itemNames}"`,
        "Reasons": `"${reasons}"`,
        "Logistics Partner": r.awbStatus || "",
        "AWB Number": r.awb || "",
        "Tracking URL": "",
        "Refund Method": r.refundMethod || "",
        "Refund Amount": r.refundAmount ? String(r.refundAmount) : "",
        "Created Date": new Date(r.createdAt).toISOString(),
        "Updated Date": new Date(r.updatedAt).toISOString(),
        "Days to Resolve": String(daysToResolve),
      };

      csvRows.push(useColumns.map((col) => row[col] || "").join(","));
    }

    // Mark as exported
    const ids = returns.map((r) => r.id);
    if (ids.length > 0) {
      await prisma.returnRequest.updateMany({
        where: { id: { in: ids } },
        data: { exportedAt: new Date() },
      });
    }

    const csv = csvRows.join("\n");
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="returns-${date}.csv"`,
      },
    });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function AdminExport() {
  const { recentExports, totalReturns } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [datePreset, setDatePreset] = useState("30days");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dataTypes, setDataTypes] = useState<string[]>(["returns", "exchanges", "refunds"]);
  const [columns, setColumns] = useState<string[]>([...CSV_COLUMNS]);

  const toggleDataType = useCallback((type: string) => {
    setDataTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const toggleColumn = useCallback((col: string) => {
    setColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }, []);

  const handleExport = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "export");
    fd.set("datePreset", datePreset);
    fd.set("dateFrom", dateFrom);
    fd.set("dateTo", dateTo);
    fd.set("dataTypes", JSON.stringify(dataTypes));
    fd.set("columns", JSON.stringify(columns));
    submit(fd, { method: "post" });
  }, [datePreset, dateFrom, dateTo, dataTypes, columns, submit]);

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Export Data</h1>
      </div>

      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Export your returns data as CSV for any time period. Total returns: {totalReturns}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          {/* Date range */}
          <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Date Range</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {DATE_PRESETS.map((dp) => (
                <button
                  key={dp.id}
                  className={`admin-btn admin-btn-sm ${datePreset === dp.id ? "admin-btn-primary" : ""}`}
                  onClick={() => { setDatePreset(dp.id); setDateFrom(""); setDateTo(""); }}
                >
                  {dp.label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Start date</label>
                <input className="admin-input" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(""); }} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>End date</label>
                <input className="admin-input" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(""); }} style={{ width: "100%" }} />
              </div>
            </div>
          </div>

          {/* Data types */}
          <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Data Types</h3>
            {DATA_TYPES.map((dt) => (
              <label key={dt.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
                <input type="checkbox" checked={dataTypes.includes(dt.id)} onChange={() => toggleDataType(dt.id)} />
                {dt.label}
              </label>
            ))}
          </div>

          <button className="admin-btn admin-btn-primary" onClick={handleExport} disabled={isLoading} style={{ width: "100%", padding: "12px 20px", fontSize: 15 }}>
            {isLoading ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        <div>
          {/* Column selector */}
          <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Columns to include</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {CSV_COLUMNS.map((col) => (
                <label key={col} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0" }}>
                  <input type="checkbox" checked={columns.includes(col)} onChange={() => toggleColumn(col)} />
                  {col}
                </label>
              ))}
            </div>
          </div>

          {/* Export history */}
          <div className="admin-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent Exports</h3>
            {recentExports.length === 0 ? (
              <p style={{ color: "#999", fontSize: 13 }}>No exports yet.</p>
            ) : (
              recentExports.map((e: any) => (
                <div key={e.reqId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}>
                  <span style={{ color: "#888" }}>{new Date(e.exportedAt).toLocaleString("en-IN")}</span>
                  <span style={{ fontWeight: 500 }}>{e.reqId}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
