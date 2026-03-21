import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Box,
  Badge,
  Button,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch analytics
  const [total, pending, approved, refunded, exchanged, rejected] =
    await Promise.all([
      prisma.returnRequest.count({ where: { shop } }),
      prisma.returnRequest.count({
        where: { shop, status: "pending" },
      }),
      prisma.returnRequest.count({
        where: { shop, status: "approved" },
      }),
      prisma.returnRequest.count({
        where: { shop, status: "refunded" },
      }),
      prisma.returnRequest.count({
        where: { shop, status: "exchange_fulfilled" },
      }),
      prisma.returnRequest.count({
        where: { shop, status: "rejected" },
      }),
    ]);

  // Recent requests
  const recent = await prisma.returnRequest.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Revenue at risk (total value of non-archived requests)
  const activeRequests = await prisma.returnRequest.findMany({
    where: { shop, status: { notIn: ["archived", "rejected"] } },
    select: { totalPrice: true },
  });
  const revenueAtRisk = activeRequests.reduce(
    (sum, r) => sum + Number(r.totalPrice),
    0,
  );

  return json({
    stats: { total, pending, approved, refunded, exchanged, rejected },
    recent,
    revenueAtRisk,
    shop,
  });
};

export default function Dashboard() {
  const { stats, recent, revenueAtRisk } = useLoaderData<typeof loader>();

  return (
    <Page title="Returns Dashboard">
      <BlockStack gap="500">
        {/* Stats Cards */}
        <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Total Requests
              </Text>
              <Text as="p" variant="headingXl">
                {stats.total}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Pending
              </Text>
              <Text as="p" variant="headingXl" tone="caution">
                {stats.pending}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Approved
              </Text>
              <Text as="p" variant="headingXl" tone="success">
                {stats.approved}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Revenue at Risk
              </Text>
              <Text as="p" variant="headingXl" tone="critical">
                ₹{revenueAtRisk.toLocaleString("en-IN")}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Refunded
              </Text>
              <Text as="p" variant="headingLg">
                {stats.refunded}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Exchanges Fulfilled
              </Text>
              <Text as="p" variant="headingLg">
                {stats.exchanged}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Recent Requests */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Recent Requests
              </Text>
              <Link to="/app/returns">
                <Button variant="plain">View all</Button>
              </Link>
            </InlineStack>
            <Divider />
            {recent.length === 0 ? (
              <Text as="p" tone="subdued">
                No return requests yet. They will appear here when customers
                submit returns.
              </Text>
            ) : (
              <BlockStack gap="300">
                {recent.map((r: any) => (
                  <Link
                    key={r.reqId}
                    to={`/app/returns/${r.reqId}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          #{r.orderNumber || r.orderId}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {r.customerName || "Customer"} &middot;{" "}
                          {r.requestType}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Text as="span" variant="bodySm">
                          ₹{Number(r.totalPrice).toLocaleString("en-IN")}
                        </Text>
                        <StatusBadge status={r.status} />
                      </InlineStack>
                    </InlineStack>
                  </Link>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    pending: { tone: "attention", label: "Pending" },
    approved: { tone: "info", label: "Approved" },
    pickup_scheduled: { tone: "info", label: "Pickup Scheduled" },
    in_transit: { tone: "info", label: "In Transit" },
    delivered: { tone: "success", label: "Delivered" },
    refunded: { tone: "success", label: "Refunded" },
    exchange_fulfilled: { tone: "success", label: "Exchanged" },
    rejected: { tone: "critical", label: "Rejected" },
    archived: { tone: undefined, label: "Archived" },
  };
  const s = map[status] || { tone: undefined, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
