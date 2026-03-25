import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useMemo } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);

  const logs = await prisma.automationLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const ruleNames = [...new Set(logs.map((l) => l.ruleName))];

  return json({ logs, ruleNames });
};

export default function AutomationLogs() {
  const { logs, ruleNames } = useLoaderData<typeof loader>();
  const [filterRule, setFilterRule] = useState("");

  const filteredLogs = useMemo(() => {
    let result = logs as any[];
    if (filterRule) result = result.filter((l: any) => l.ruleName === filterRule);
    return result;
  }, [logs, filterRule]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings/automation" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Automations</Link>
          <h1 style={{ margin: "4px 0 0" }}>Automation Logs</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>History of automation rule executions</p>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <select className="admin-input" value={filterRule} onChange={(e) => setFilterRule(e.target.value)} style={{ width: 240 }}>
          <option value="">All rules</option>
          {(ruleNames as string[]).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "#888" }}>
          Showing {filteredLogs.length} log{filteredLogs.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="admin-card" style={{ padding: 0 }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>
            No automation logs found.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Return ID</th>
                <th>Matched</th>
                <th>Actions</th>
                <th>Result</th>
                <th>Error</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log: any) => {
                const actionsRun = (log.actionsRun as any[]) || [];
                const successCount = actionsRun.filter((a) => a.success).length;
                const failCount = actionsRun.filter((a) => !a.success).length;
                const date = new Date(log.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                });

                return (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 500 }}>{log.ruleName}</td>
                    <td style={{ fontSize: 12, fontFamily: "monospace" }}>{log.returnId.slice(0, 12)}...</td>
                    <td>
                      <span className={`admin-badge ${log.conditionsMet ? "success" : ""}`}>
                        {log.conditionsMet ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{actionsRun.map((a: any) => a.type).join(", ") || "\u2014"}</td>
                    <td>
                      {failCount > 0 ? (
                        <span style={{ color: "var(--admin-danger)", fontSize: 12 }}>{successCount} ok, {failCount} failed</span>
                      ) : (
                        <span style={{ color: "var(--admin-success)", fontSize: 12 }}>{successCount} ok</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: log.error ? "var(--admin-danger)" : "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.error || "\u2014"}
                    </td>
                    <td style={{ fontSize: 12, color: "#888" }}>{date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
