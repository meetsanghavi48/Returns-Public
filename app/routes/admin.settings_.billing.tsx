import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

const PLANS = [
  { id: "starter", name: "Starter", price: "Free", requests: 100, logistics: 1, users: 1 },
  { id: "grow", name: "Grow", price: "$9.99/mo", requests: 500, logistics: 3, users: 3 },
  { id: "scale", name: "Scale", price: "$29.99/mo", requests: 2000, logistics: 10, users: 10 },
  { id: "enterprise", name: "Enterprise", price: "Custom", requests: -1, logistics: -1, users: -1 },
];

const CREDIT_PACKS = [
  { amount: 50, price: "$7" },
  { amount: 100, price: "$14" },
  { amount: 200, price: "$28" },
  { amount: 500, price: "$70" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);

  let usage = await prisma.billingUsage.findUnique({ where: { shop } });
  if (!usage) {
    usage = await prisma.billingUsage.create({
      data: {
        shop,
        plan: "starter",
        requestsLimit: 100,
        logisticsLimit: 1,
        usersLimit: 1,
        billingCycleEnd: new Date(Date.now() + 30 * 86400000),
      },
    });
  }

  return json({ usage });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "switch_plan") {
    const planId = formData.get("plan") as string;
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return json({ error: "Invalid plan" }, { status: 400 });
    await prisma.billingUsage.upsert({
      where: { shop },
      update: {
        plan: planId,
        requestsLimit: plan.requests === -1 ? 999999 : plan.requests,
        logisticsLimit: plan.logistics === -1 ? 999 : plan.logistics,
        usersLimit: plan.users === -1 ? 999 : plan.users,
      },
      create: {
        shop,
        plan: planId,
        requestsLimit: plan.requests === -1 ? 999999 : plan.requests,
        logisticsLimit: plan.logistics === -1 ? 999 : plan.logistics,
        usersLimit: plan.users === -1 ? 999 : plan.users,
        billingCycleEnd: new Date(Date.now() + 30 * 86400000),
      },
    });
    return json({ ok: true });
  }

  if (intent === "add_credits") {
    const amount = parseInt(formData.get("amount") as string) || 0;
    await prisma.billingUsage.update({
      where: { shop },
      data: { additionalCredits: { increment: amount } },
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SettingsBilling() {
  const { usage } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [selectedCredits, setSelectedCredits] = useState(100);

  const currentPlan = PLANS.find((p) => p.id === usage.plan) || PLANS[0];
  const totalLimit = usage.requestsLimit + usage.additionalCredits;
  const usagePercent = totalLimit > 0 ? Math.min(100, (usage.requestsUsed / totalLimit) * 100) : 0;
  const atLimit = usage.requestsUsed >= totalLimit;

  const handleSwitchPlan = (planId: string) => {
    if (planId === usage.plan) return;
    const fd = new FormData();
    fd.set("intent", "switch_plan");
    fd.set("plan", planId);
    submit(fd, { method: "post" });
  };

  const handleAddCredits = () => {
    const fd = new FormData();
    fd.set("intent", "add_credits");
    fd.set("amount", String(selectedCredits));
    submit(fd, { method: "post" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Billing</h1>
        </div>
      </div>

      {atLimit && (
        <div className="admin-card" style={{ background: "#FEF2F2", borderLeft: "4px solid var(--admin-danger)", marginBottom: 24, padding: 16 }}>
          <p style={{ fontSize: 14, color: "#991b1b", margin: 0, fontWeight: 600 }}>
            You have reached your request limit. Upgrade your plan or add credits to continue creating returns.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="admin-stats-grid" style={{ marginBottom: 32 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Requests Used</div>
          <div className="admin-stat-value">{usage.requestsUsed}/{totalLimit}</div>
          <div style={{ background: "#e5e7eb", borderRadius: 4, height: 6, marginTop: 8 }}>
            <div style={{ background: atLimit ? "var(--admin-danger)" : "var(--admin-accent)", borderRadius: 4, height: 6, width: `${usagePercent}%`, transition: "width 0.3s" }} />
          </div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>You have used {usage.requestsUsed} out of {totalLimit} requests available.</p>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Logistics Integrated</div>
          <div className="admin-stat-value">{usage.logisticsUsed}/{usage.logisticsLimit}</div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>You have used {usage.logisticsUsed} out of {usage.logisticsLimit} logistic connections available.</p>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Users Added</div>
          <div className="admin-stat-value">{usage.usersUsed}/{usage.usersLimit}</div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>You have added {usage.usersUsed} out of {usage.usersLimit} users.</p>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Current Plan</div>
          <div className="admin-stat-value accent">{currentPlan.name}</div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Next billing: {new Date(usage.billingCycleEnd).toLocaleDateString("en-IN")}
          </p>
        </div>
      </div>

      {/* Credit packs */}
      <div className="admin-card" style={{ border: "2px solid var(--admin-warning)", marginBottom: 32, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: "#92400e" }}>Expecting a high request volume?</h3>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>Purchase additional request credits for your current billing cycle.</p>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {CREDIT_PACKS.map((pack) => (
            <button
              key={pack.amount}
              onClick={() => setSelectedCredits(pack.amount)}
              style={{
                padding: "12px 20px", borderRadius: 8, border: "2px solid",
                borderColor: selectedCredits === pack.amount ? "var(--admin-accent)" : "#e5e7eb",
                background: selectedCredits === pack.amount ? "#EFF6FF" : "#fff",
                cursor: "pointer", textAlign: "center", minWidth: 100,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18 }}>{pack.amount}</div>
              <div style={{ fontSize: 12, color: "#888" }}>requests</div>
              <div style={{ fontWeight: 600, color: "var(--admin-accent)", marginTop: 4 }}>{pack.price}</div>
            </button>
          ))}
        </div>
        <button className="admin-btn admin-btn-primary" onClick={handleAddCredits} disabled={isLoading}>
          {isLoading ? "Adding..." : "Add credits"}
        </button>
        <span style={{ marginLeft: 16, fontSize: 13, color: "var(--admin-accent)", cursor: "pointer", textDecoration: "underline" }}>Need custom return requests? Click here</span>
      </div>

      {/* Plans table */}
      <div className="admin-card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Plans</h3>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Price</th>
              <th>Requests/mo</th>
              <th>Logistics</th>
              <th>Users</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((plan) => (
              <tr key={plan.id} style={{ background: usage.plan === plan.id ? "#EFF6FF" : undefined }}>
                <td style={{ fontWeight: 600 }}>{plan.name}</td>
                <td>{plan.price}</td>
                <td>{plan.requests === -1 ? "Unlimited" : plan.requests}</td>
                <td>{plan.logistics === -1 ? "Unlimited" : plan.logistics}</td>
                <td>{plan.users === -1 ? "Unlimited" : plan.users}</td>
                <td>
                  {usage.plan === plan.id ? (
                    <span className="admin-badge success">Current</span>
                  ) : (
                    <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => handleSwitchPlan(plan.id)} disabled={isLoading}>
                      Switch
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
