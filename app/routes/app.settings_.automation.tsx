import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import { ensureDefaultRules } from "../services/automation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  await ensureDefaultRules(shop);

  const rules = await prisma.automationRule.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const runsToday = await prisma.automationLog.count({
    where: { shop, conditionsMet: true, createdAt: { gte: todayStart } },
  });

  return json({ rules, runsToday });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const ruleId = formData.get("ruleId") as string;

  if (intent === "toggle") {
    const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, shop } });
    if (rule) {
      await prisma.automationRule.update({
        where: { id: ruleId },
        data: { isActive: !rule.isActive },
      });
    }
    return json({ success: true });
  }

  if (intent === "delete") {
    await prisma.automationRule.deleteMany({ where: { id: ruleId, shop } });
    return json({ success: true });
  }

  return json({ success: false });
};

export default function SettingsAutomation() {
  const { rules, runsToday } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const activeCount = (rules as any[]).filter((r) => r.isActive).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/app/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Automations</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Create rules to automatically perform actions based on conditions.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn" onClick={() => navigate("/app/settings/automation/logs")}>View logs</button>
          <button className="admin-btn admin-btn-primary" onClick={() => navigate("/app/settings/automation/new")}>+ Create new rule</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        {/* Left panel */}
        <div>
          <div className="admin-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>How it works</h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>
              Create automation rules to reduce your redundant work and let us take care of it.
              Once a rule is activated, our system will perform actions automatically based on
              rule conditions defined by you.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="admin-badge success">{activeCount}</span>
                <span style={{ fontSize: 13 }}>rules active</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="admin-badge">{runsToday}</span>
                <span style={{ fontSize: 13 }}>runs today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div>
          {(rules as any[]).length === 0 ? (
            <div className="admin-card" style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#9889;</div>
              <h3 style={{ fontSize: 18, marginBottom: 8 }}>No automation rules yet</h3>
              <p style={{ color: "#666", marginBottom: 16 }}>Set up rules to automate approvals, rejections, tagging, and more.</p>
              <button className="admin-btn admin-btn-primary" onClick={() => navigate("/app/settings/automation/new")}>
                Create your first rule
              </button>
            </div>
          ) : (
            (rules as any[]).map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: any }) {
  const navigate = useNavigate();
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const isActive = toggleFetcher.formData
    ? !rule.isActive
    : rule.isActive;

  const handleToggle = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "toggle");
    fd.set("ruleId", rule.id);
    toggleFetcher.submit(fd, { method: "post" });
  }, [rule, toggleFetcher]);

  const handleDelete = useCallback(() => {
    if (!confirm(`Delete "${rule.name}"?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("ruleId", rule.id);
    deleteFetcher.submit(fd, { method: "post" });
  }, [rule, deleteFetcher]);

  const lastRun = rule.lastRunAt
    ? new Date(rule.lastRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Never";

  const conditions = (rule.conditions as any[]) || [];
  const actions = (rule.actions as any[]) || [];

  return (
    <div className="admin-card" style={{ marginBottom: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <label className="toggle-switch" style={{ marginTop: 2 }}>
            <input type="checkbox" checked={isActive} onChange={handleToggle} />
            <span className="toggle-slider" />
          </label>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{rule.name}</h3>
              <span className={`admin-badge ${isActive ? "success" : ""}`}>{isActive ? "Active" : "Inactive"}</span>
            </div>
            {rule.description && (
              <p style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>{rule.description}</p>
            )}
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#888" }}>
              <span>{conditions.length} condition{conditions.length !== 1 ? "s" : ""} ({rule.matchType})</span>
              <span>{actions.length} action{actions.length !== 1 ? "s" : ""}</span>
              <span>Run count: {rule.runCount}</span>
              <span>Last run: {lastRun}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="admin-btn admin-btn-sm" onClick={() => navigate(`/admin/settings/automation/${rule.id}`)}>
            Edit
          </button>
          <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
