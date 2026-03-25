import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Card, DataTable, Badge, BlockStack, Text,  Select, InlineStack,
} from "@shopify/polaris";
import { useState, useMemo } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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
    if (filterRule) result = result.filter((l) => l.ruleName === filterRule);
    return result;
  }, [logs, filterRule]);

  const rows = filteredLogs.map((log: any) => {
    const actionsRun = (log.actionsRun as any[]) || [];
    const successCount = actionsRun.filter((a) => a.success).length;
    const failCount = actionsRun.filter((a) => !a.success).length;
    const date = new Date(log.createdAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    return [
      log.ruleName,
      log.returnId,
      log.conditionsMet ? "Yes" : "No",
      actionsRun.map((a: any) => a.type).join(", ") || "—",
      failCount > 0 ? `${successCount} ok, ${failCount} failed` : `${successCount} ok`,
      log.error || "—",
      date,
    ];
  });

  return (
    
      <Page
        backAction={{ content: "Automations", url: "/app/settings/automation" }}
        title="Automation Logs"
        subtitle="History of automation rule executions"
      >
        <BlockStack gap="400">
          <Card>
            <InlineStack gap="300" blockAlign="end">
              <div style={{ minWidth: 200 }}>
                <Select
                  label="Filter by rule"
                  options={[
                    { label: "All rules", value: "" },
                    ...(ruleNames as string[]).map((n) => ({ label: n, value: n })),
                  ]}
                  value={filterRule}
                  onChange={setFilterRule}
                />
              </div>
              <Text as="span" variant="bodySm" tone="subdued">
                Showing {filteredLogs.length} log{filteredLogs.length !== 1 ? "s" : ""}
              </Text>
            </InlineStack>
          </Card>

          <Card>
            {rows.length === 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">No automation logs found.</Text>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                headings={["Rule", "Return ID", "Matched", "Actions", "Result", "Error", "Date"]}
                rows={rows}
                truncate
              />
            )}
          </Card>
        </BlockStack>
      </Page>
    
  );
}
