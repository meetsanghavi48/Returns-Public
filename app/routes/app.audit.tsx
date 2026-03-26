import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  const where: any = { shop };
  if (search) {
    where.OR = [
      { orderId: { contains: search } },
      { reqId: { contains: search } },
      { action: { contains: search, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return json({ logs, search });
};

export default function AdminAudit() {
  const { logs, search } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    searchValue ? params.set("search", searchValue) : params.delete("search");
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  return (
    <>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Audit Log</h1>
      </div>

      <div className="admin-card">
        <div className="admin-search">
          <input
            className="admin-input"
            placeholder="Search by order ID, request ID, or action..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button className="admin-btn" onClick={handleSearch}>Search</button>
        </div>

        {logs.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">📜</div>
            <div className="admin-empty-text">No audit entries</div>
            <div className="admin-empty-sub">Entries will appear here as actions are taken on return requests.</div>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Request</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleString("en-IN")}</td>
                  <td>{log.orderId || "—"}</td>
                  <td>{log.reqId || "—"}</td>
                  <td><span style={{ fontWeight: 600 }}>{log.action}</span></td>
                  <td>{log.actor || "system"}</td>
                  <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(log.details || "").slice(0, 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
