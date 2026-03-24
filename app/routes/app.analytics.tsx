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
  statusCounts: StatusCount[];
  reasonBreakdown: ReasonBreakdown[];
  topProducts: TopProduct[];
  monthlyTrends: MonthlyTrend[];
  totalReturns: number;
  approvalRate: number;
  avgResolutionDays: number;
  totalRefunded: number;
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
  const dateFilter: { shop: string; createdAt?: { gte: Date } } = { shop };
  if (dateFrom) {
    dateFilter.createdAt = { gte: dateFrom };
  }

  // Fetch all returns matching the date filter
  const returns = await prisma.returnRequest.findMany({
    where: dateFilter,
    select: {
      status: true,
      items: true,
      refundAmount: true,
      createdAt: true,
      approvedAt: true,
      requestType: true,
    },
  });

  const totalReturns = returns.length;

  // Status counts
  const statusMap = new Map<string, number>();
  const allStatuses = [
    "pending",
    "approved",
    "pickup_scheduled",
    "in_transit",
    "delivered",
    "refunded",
    "exchanged",
    "rejected",
  ];
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

  // Approval rate
  const decidedCount =
    (statusMap.get("approved") || 0) +
    (statusMap.get("pickup_scheduled") || 0) +
    (statusMap.get("in_transit") || 0) +
    (statusMap.get("delivered") || 0) +
    (statusMap.get("refunded") || 0) +
    (statusMap.get("exchanged") || 0) +
    (statusMap.get("rejected") || 0);
  const approvedCount = decidedCount - (statusMap.get("rejected") || 0);
  const approvalRate = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;

  // Avg resolution time (from createdAt to approvedAt for those that have it)
  let totalResolutionMs = 0;
  let resolutionCount = 0;
  for (const r of returns) {
    if (r.approvedAt) {
      totalResolutionMs += new Date(r.approvedAt).getTime() - new Date(r.createdAt).getTime();
      resolutionCount++;
    }
  }
  const avgResolutionDays =
    resolutionCount > 0
      ? Math.round(totalResolutionMs / resolutionCount / (1000 * 60 * 60 * 24) * 10) / 10
      : 0;

  // Total refunded
  let totalRefunded = 0;
  for (const r of returns) {
    if (r.refundAmount) {
      totalRefunded += Number(r.refundAmount);
    }
  }

  // Return reasons breakdown
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
      percentage: totalItemsWithReason > 0 ? Math.round((count / totalItemsWithReason) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Top 10 returned products
  const productMap = new Map<string, number>();
  for (const r of returns) {
    const items = (r.items as ReturnItem[]) || [];
    for (const item of items) {
      const title = item.title || "Unknown Product";
      productMap.set(title, (productMap.get(title) || 0) + (item.quantity || 1));
    }
  }
  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Monthly trends
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
    statusCounts,
    reasonBreakdown,
    topProducts,
    monthlyTrends,
    totalReturns,
    approvalRate,
    avgResolutionDays,
    totalRefunded: Math.round(totalRefunded * 100) / 100,
    dateRange,
  };

  return json(data);
};

const STATUS_BADGE_TONE: Record<string, "attention" | "info" | "success" | "critical" | undefined> =
  {
    pending: "attention",
    approved: "info",
    pickup_scheduled: "info",
    in_transit: "info",
    delivered: "success",
    refunded: "success",
    exchanged: "success",
    rejected: "critical",
  };

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short" });
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
    <Page title="Analytics">
      <BlockStack gap="400">
        {/* Date range filter */}
        <Box paddingBlockEnd="200">
          <InlineStack align="end">
            <div style={{ width: 200 }}>
              <Select
                label="Date range"
                labelInline
                options={dateRangeOptions}
                value={data.dateRange}
                onChange={handleDateRangeChange}
              />
            </div>
          </InlineStack>
        </Box>

        {/* Stats cards row */}
        <Layout>
          <Layout.Section variant="oneQuarter">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Returns
                </Text>
                <Text as="p" variant="headingXl">
                  {data.totalReturns}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneQuarter">
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
          <Layout.Section variant="oneQuarter">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Avg Resolution Time
                </Text>
                <Text as="p" variant="headingXl">
                  {data.avgResolutionDays}d
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneQuarter">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Refunded
                </Text>
                <Text as="p" variant="headingXl">
                  {formatCurrency(data.totalRefunded)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Returns by Status + Return Reasons */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Returns by Status
                </Text>
                <BlockStack gap="200">
                  {data.statusCounts.map((sc) => (
                    <InlineStack key={sc.status} align="space-between" blockAlign="center">
                      <Badge tone={STATUS_BADGE_TONE[sc.status]}>{formatStatus(sc.status)}</Badge>
                      <Text as="span" variant="bodyMd">
                        {sc.count}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Return Reasons
                </Text>
                {data.reasonBreakdown.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No return reasons data available.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {data.reasonBreakdown.map((rb) => (
                      <InlineStack key={rb.reason} align="space-between" blockAlign="center">
                        <Text as="span" variant="bodyMd">
                          {rb.reason}
                        </Text>
                        <Text as="span" variant="bodyMd">
                          {rb.count} ({rb.percentage}%)
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Top Returned Products */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Top Returned Products
                </Text>
                {data.topProducts.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No product return data available.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric"]}
                    headings={["Product", "Return Count"]}
                    rows={data.topProducts.map((p) => [p.title, p.count])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Monthly Trends */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Monthly Trends
                </Text>
                {data.monthlyTrends.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No monthly trend data available.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric"]}
                    headings={["Month", "Returns", "Refund Total"]}
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
