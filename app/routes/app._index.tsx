import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [total, pending, approved, refunded, exchanged, rejected, recentReturns] =
    await Promise.all([
      prisma.returnRequest.count({ where: { shop } }),
      prisma.returnRequest.count({ where: { shop, status: "pending" } }),
      prisma.returnRequest.count({ where: { shop, status: "approved" } }),
      prisma.returnRequest.count({ where: { shop, status: "refunded" } }),
      prisma.returnRequest.count({ where: { shop, status: "exchanged" } }),
      prisma.returnRequest.count({ where: { shop, status: "rejected" } }),
      prisma.returnRequest.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          reqId: true,
          orderNumber: true,
          customerName: true,
          status: true,
          requestType: true,
          createdAt: true,
          totalPrice: true,
        },
      }),
    ]);

  return json({
    stats: { total, pending, approved, refunded, exchanged, rejected },
    recentReturns: recentReturns.map((r) => ({
      ...r,
      totalPrice: Number(r.totalPrice),
      createdAt: r.createdAt.toISOString(),
    })),
  });
};

const STATUS_TONE: Record<string, "success" | "warning" | "critical" | "info" | "attention" | undefined> = {
  pending: "attention",
  approved: "info",
  pickup_scheduled: "info",
  in_transit: "info",
  delivered: "success",
  refunded: "success",
  exchanged: "success",
  rejected: "critical",
  archived: undefined,
};

export default function Dashboard() {
  const { stats, recentReturns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const statCards = [
    { label: "Total Returns", value: stats.total, tone: undefined },
    { label: "Pending", value: stats.pending, tone: "attention" as const },
    { label: "Approved", value: stats.approved, tone: "info" as const },
    { label: "Refunded", value: stats.refunded, tone: "success" as const },
    { label: "Exchanged", value: stats.exchanged, tone: "success" as const },
    { label: "Rejected", value: stats.rejected, tone: "critical" as const },
  ];

  const tableRows = recentReturns.map((r) => [
    r.orderNumber || r.reqId,
    r.customerName || "—",
    r.requestType,
    r.status,
    new Date(r.createdAt).toLocaleDateString(),
  ]);

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        <InlineStack gap="400" wrap>
          {statCards.map((card) => (
            <Box key={card.label} minWidth="140px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodySm" tone="subdued" as="p">
                    {card.label}
                  </Text>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingXl" as="p">
                      {card.value}
                    </Text>
                    {card.tone && <Badge tone={card.tone}>{card.label}</Badge>}
                  </InlineStack>
                </BlockStack>
              </Card>
            </Box>
          ))}
        </InlineStack>

        <InlineStack gap="300">
          <Button onClick={() => navigate("/app/returns")}>View All Returns</Button>
          <Button onClick={() => navigate("/app/returns/new")}>Create Return</Button>
          <Button onClick={() => navigate("/app/integrations")}>Integrations</Button>
          <Button onClick={() => navigate("/app/analytics")}>Analytics</Button>
        </InlineStack>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Recent Returns
                </Text>
                {recentReturns.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Order", "Customer", "Type", "Status", "Date"]}
                    rows={tableRows}
                  />
                ) : (
                  <EmptyState
                    heading="No returns yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Returns will appear here once customers submit them.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
