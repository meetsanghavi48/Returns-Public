import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Text,
  Select,
  BlockStack,
  InlineStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ReturnItem {
  title?: string;
  quantity?: number;
  reason?: string;
}

interface StatusCount {
  status: string;
  count: number;
}

interface ReasonBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

interface TopProduct {
  title: string;
  count: number;
}

interface MonthlyTrend {
  month: string;
  count: number;
  refundTotal: number;
}

interface AnalyticsData {
  totalRequests: number;
  approvalRate: number;
  avgResolutionDays: number;
  statusCounts: StatusCount[];
  reasonBreakdown: ReasonBreakdown[];
  topProducts: TopProduct[];
  monthlyTrends: MonthlyTrend[];
  dateRange: string;
}

function getDateFilter(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const dateRange = url.searchParams.get("dateRange") || "30d";

  const dateFrom = getDateFilter(dateRange);
  const whereClause: { shop: string; createdAt?: { gte: Date } } = { shop };
  if (dateFrom) {
    whereClause.createdAt = { gte: dateFrom };
  }

  // 1. Fetch all returns matching the date filter
  const returns = await prisma.returnRequest.findMany({
    where: whereClause,
    select: {
      status: true,
      items: true,
      refundAmount: true,
      createdAt: true,
      archivedAt: true,
    },
  });

  // 1. Total requests count
  const totalRequests = returns.length;

  // 2. Approval rate (approved + refunded + exchanged / total * 100)
  const approvedStatuses = new Set(["approved", "refunded", "exchanged"]);
  const approvedCount = returns.filter((r) =>
    approvedStatuses.has(r.status),
  ).length;
  const approvalRate =
    totalRequests > 0
      ? Math.round((approvedCount / totalRequests) * 1000) / 10
      : 0;

  // 3. Average resolution time (avg days between createdAt and archivedAt for archived returns)
  let totalResolutionMs = 0;
  let resolutionCount = 0;
  for (const r of returns) {
    if (r.archivedAt) {
      totalResolutionMs +=
        new Date(r.archivedAt).getTime() - new Date(r.createdAt).getTime();
      resolutionCount++;
    }
  }
  const avgResolutionDays =
    resolutionCount > 0
      ? Math.round(
          (totalResolutionMs / resolutionCount / (1000 * 60 * 60 * 24)) * 10,
        ) / 10
      : 0;

  // 4. Returns by status (count per status)
  const allStatuses = [
    "pending",
    "approved",
    "pickup_scheduled",
    "in_transit",
    "delivered",
    "refunded",
    "exchanged",
    "rejected",
    "archived",
  ];
  const statusMap = new Map<string, number>();
  for (const s of allStatuses) {
    statusMap.set(s, 0);
  }
  for (const r of returns) {
    statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
  }
  const statusCounts: StatusCount[] = allStatuses.map((s) => ({
    status: s,
    count: statusMap.get(s) || 0,
  }));

  // 5. Return reasons breakdown (parse items JSON, extract reasons, count + percentage)
  const reasonMap = new Map<string, number>();
  let totalItemsWithReason = 0;
  for (const r of returns) {
    const items = (r.items as ReturnItem[]) || [];
    for (const item of items) {
      const reason = item.reason || "Not specified";
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
      totalItemsWithReason++;
    }
  }
  const reasonBreakdown: ReasonBreakdown[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage:
        totalItemsWithReason > 0
          ? Math.round((count / totalItemsWithReason) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 6. Top 10 returned products (parse items JSON, group by title, count)
  const productMap = new Map<string, number>();
  for (const r of returns) {
    const items = (r.items as ReturnItem[]) || [];
    for (const item of items) {
      const title = item.title || "Unknown Product";
      productMap.set(
        title,
        (productMap.get(title) || 0) + (item.quantity || 1),
      );
    }
  }
  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 7. Monthly trends (group by month, count returns, sum refund amounts)
  const monthMap = new Map<string, { count: number; refundTotal: number }>();
  for (const r of returns) {
    const date = new Date(r.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthMap.get(monthKey) || { count: 0, refundTotal: 0 };
    existing.count++;
    existing.refundTotal += r.refundAmount ? Number(r.refundAmount) : 0;
    monthMap.set(monthKey, existing);
  }
  const monthlyTrends: MonthlyTrend[] = Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      count: data.count,
      refundTotal: Math.round(data.refundTotal * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const data: AnalyticsData = {
    totalRequests,
    approvalRate,
    avgResolutionDays,
    statusCounts,
    reasonBreakdown,
    topProducts,
    monthlyTrends,
    dateRange,
  };

  return json(data);
};

const STATUS_BADGE_TONE: Record<
  string,
  "attention" | "info" | "success" | "critical" | "warning" | undefined
> = {
  pending: "attention",
  approved: "info",
  pickup_scheduled: "info",
  in_transit: "info",
  delivered: "success",
  refunded: "success",
  exchanged: "success",
  rejected: "critical",
  archived: "warning",
};

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleDateRangeChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("dateRange", value);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const dateRangeOptions = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "All time", value: "all" },
  ];

  return (
    <Page title="Analytics" backAction={{ content: "Home", url: "/app" }}>
      <BlockStack gap="500">
        {/* Row 1 - Date range selector */}
        <Card>
          <InlineStack align="end">
            <Box minWidth="220px">
              <Select
                label="Date range"
                labelInline
                options={dateRangeOptions}
                value={data.dateRange}
                onChange={handleDateRangeChange}
              />
            </Box>
          </InlineStack>
        </Card>

        {/* Row 2 - 3 stat cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Requests
                </Text>
                <Text as="p" variant="headingXl">
                  {data.totalRequests}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Approval Rate
                </Text>
                <Text as="p" variant="headingXl">
                  {data.approvalRate}%
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Avg Resolution Time
                </Text>
                <Text as="p" variant="headingXl">
                  {data.avgResolutionDays} days
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Row 3 - Returns by Status */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Returns by Status
                </Text>
                <Divider />
                <BlockStack gap="300">
                  {data.statusCounts.map((sc) => (
                    <InlineStack
                      key={sc.status}
                      align="space-between"
                      blockAlign="center"
                    >
                      <Badge tone={STATUS_BADGE_TONE[sc.status]}>
                        {formatStatus(sc.status)}
                      </Badge>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {sc.count}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Row 4 - Return Reasons Breakdown */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Return Reasons Breakdown
                </Text>
                <Divider />
                {data.reasonBreakdown.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No return reasons data available.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric"]}
                    headings={["Reason", "Count", "Percentage"]}
                    rows={data.reasonBreakdown.map((rb) => [
                      rb.reason,
                      rb.count,
                      `${rb.percentage}%`,
                    ])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Row 5 - Top Returned Products */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Top Returned Products
                </Text>
                <Divider />
                {data.topProducts.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No product return data available.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric"]}
                    headings={["Product", "Times Returned"]}
                    rows={data.topProducts.map((p) => [p.title, p.count])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Row 6 - Monthly Trends */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Monthly Trends
                </Text>
                <Divider />
                {data.monthlyTrends.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No monthly trend data available.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric"]}
                    headings={["Month", "Returns", "Refund Amount"]}
                    rows={data.monthlyTrends.map((mt) => [
                      formatMonth(mt.month),
                      mt.count,
                      formatCurrency(mt.refundTotal),
                    ])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
