import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Card, Badge, Button, BlockStack, InlineStack, Text, Layout,
  Banner,  Toast, EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { ensureDefaultRules } from "~/services/automation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
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
  const [toastMsg, setToastMsg] = useState("");

  const activeCount = (rules as any[]).filter((r) => r.isActive).length;

  return (
    
      <Page
        backAction={{ content: "Settings", url: "/app/settings" }}
        title="Automations"
        subtitle="Create rules to automatically perform actions based on conditions. Reduce manual work and respond faster."
        primaryAction={{ content: "+ Create new rule", onAction: () => navigate("/app/settings/automation/new") }}
        secondaryActions={[{ content: "View logs", onAction: () => navigate("/app/settings/automation/logs") }]}
      >
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">How it works</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Create automation rules to reduce your redundant work and let us take care of it.
                  Once a rule is activated, our system will perform actions automatically based on
                  rule conditions defined by you.
                </Text>
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">{String(activeCount)}</Badge>
                    <Text as="span" variant="bodySm">rules active</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge>{String(runsToday)}</Badge>
                    <Text as="span" variant="bodySm">runs today</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            {(rules as any[]).length === 0 ? (
              <Card>
                <EmptyState
                  heading="No automation rules yet"
                  action={{ content: "Create your first rule", onAction: () => navigate("/app/settings/automation/new") }}
                  image=""
                >
                  <p>Set up rules to automate approvals, rejections, tagging, and more.</p>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {(rules as any[]).map((rule) => (
                  <RuleCard key={rule.id} rule={rule} onToast={setToastMsg} />
                ))}
              </BlockStack>
            )}
          </Layout.Section>
        </Layout>

        {toastMsg && <Toast content={toastMsg} onDismiss={() => setToastMsg("")} duration={3000} />}
      </Page>
    
  );
}

function RuleCard({ rule, onToast }: { rule: any; onToast: (msg: string) => void }) {
  const navigate = useNavigate();
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const isActive = toggleFetcher.formData
    ? !rule.isActive // optimistic toggle
    : rule.isActive;

  const handleToggle = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "toggle");
    fd.set("ruleId", rule.id);
    toggleFetcher.submit(fd, { method: "post" });
    onToast(isActive ? `"${rule.name}" disabled` : `"${rule.name}" enabled`);
  }, [rule, isActive, toggleFetcher, onToast]);

  const handleDelete = useCallback(() => {
    if (!confirm(`Delete "${rule.name}"?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("ruleId", rule.id);
    deleteFetcher.submit(fd, { method: "post" });
    onToast(`"${rule.name}" deleted`);
  }, [rule, deleteFetcher, onToast]);

  const lastRun = rule.lastRunAt
    ? new Date(rule.lastRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Never";

  const conditions = (rule.conditions as any[]) || [];
  const actions = (rule.actions as any[]) || [];

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">{rule.name}</Text>
            <Badge tone={isActive ? "success" : undefined}>{isActive ? "Active" : "Inactive"}</Badge>
          </InlineStack>
          <InlineStack gap="200">
            <Button size="slim" onClick={handleToggle}>
              {isActive ? "Turn Off" : "Turn On"}
            </Button>
            <Button size="slim" onClick={() => navigate(`/app/settings/automation/${rule.id}`)}>Edit</Button>
            <Button size="slim" tone="critical" onClick={handleDelete}>Delete</Button>
          </InlineStack>
        </InlineStack>

        {rule.description && (
          <Text as="p" variant="bodySm" tone="subdued">{rule.description}</Text>
        )}

        <InlineStack gap="400">
          <Text as="span" variant="bodySm" tone="subdued">
            {conditions.length} condition{conditions.length !== 1 ? "s" : ""} ({rule.matchType})
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {actions.length} action{actions.length !== 1 ? "s" : ""}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            Run count: {rule.runCount}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            Last run: {lastRun}
          </Text>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
