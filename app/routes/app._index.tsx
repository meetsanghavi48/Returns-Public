import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Badge,
  Button,
  Tabs,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Pagination,
  useIndexResourceState,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest } from "../services/returns.server";

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { id: "pending", content: "Requested" },
  { id: "approved", content: "Approved" },
  { id: "in_transit", content: "In Transit" },
  { id: "delivered", content: "Received" },
  { id: "refunded", content: "Refunded" },
  { id: "archived", content: "Archived" },
  { id: "rejected", content: "Rejected" },
  { id: "all", content: "All" },
];

const DATE_RANGE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

function getDateRangeFilter(dateRange: string): { gte?: Date; lte?: Date } | undefined {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (dateRange) {
    case "today":
      return { gte: startOfToday };
    case "yesterday": {
      const yesterday = new Date(startOfToday);
      yesterday.setDate(yesterday.getDate() - 1);
      return { gte: yesterday, lte: startOfToday };
    }
    case "7d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 7);
      return { gte: d };
    }
    case "30d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 30);
      return { gte: d };
    }
    default:
      return undefined;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const search = url.searchParams.get("search") || "";
  const dateRange = url.searchParams.get("dateRange") || "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

  // Stats for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const statsWhere = { shop, createdAt: { gte: thirtyDaysAgo } };

  const [totalReturns, pendingCount, inTransitCount, refundedAgg] =
    await Promise.all([
      prisma.returnRequest.count({ where: statsWhere }),
      prisma.returnRequest.count({
        where: { ...statsWhere, status: "pending" },
      }),
      prisma.returnRequest.count({
        where: { ...statsWhere, status: "in_transit" },
      }),
      prisma.returnRequest.aggregate({
        where: { ...statsWhere, refundAmount: { not: null } },
        _sum: { refundAmount: true },
      }),
    ]);

  const totalRefunded = Number(refundedAgg._sum.refundAmount || 0);

  // Build filter where clause
  const where: any = { shop };
  if (status !== "all") {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { reqId: { contains: search } },
      { orderNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  const dateFilter = getDateRangeFilter(dateRange);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // Get total count for pagination
  const totalCount = await prisma.returnRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Query returns with pagination
  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      reqId: true,
      reqNum: true,
      orderNumber: true,
      orderId: true,
      customerName: true,
      status: true,
      requestType: true,
      createdAt: true,
    },
  });

  return json({
    stats: {
      totalReturns,
      pendingCount,
      inTransitCount,
      totalRefunded,
    },
    returns: returns.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      currentPage,
      totalPages,
      totalCount,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1,
    },
    filters: { status, search, dateRange },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqIds = (formData.get("reqIds") as string || "")
    .split(",")
    .filter(Boolean);

  if (intent === "bulk_approve") {
    for (const reqId of reqIds) {
      await approveRequest(shop, session.accessToken!, reqId);
    }
  } else if (intent === "bulk_reject") {
    for (const reqId of reqIds) {
      await rejectRequest(shop, session.accessToken!, reqId, "Bulk rejection");
    }
  }

  return json({ ok: true });
};

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "critical" | "info" | "attention" | undefined
> = {
  pending: "attention",
  requested: "attention",
  approved: "info",
  pickup_scheduled: "info",
  in_transit: "info",
  delivered: "success",
  received: "success",
  refunded: "success",
  exchanged: "success",
  exchange_fulfilled: "success",
  rejected: "critical",
  archived: undefined,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  requested: "Requested",
  approved: "Approved",
  pickup_scheduled: "Pickup Scheduled",
  in_transit: "In Transit",
  delivered: "Received",
  received: "Received",
  refunded: "Refunded",
  exchanged: "Exchanged",
  exchange_fulfilled: "Exchanged",
  rejected: "Rejected",
  archived: "Archived",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

function formatCurrency(amount: number): string {
  return "\u20B9" + amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function Dashboard() {
  const { stats, returns, pagination, filters } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search);

  const selectedTab = STATUS_TABS.findIndex((t) => t.id === filters.status);

  const resourceName = { singular: "return", plural: "returns" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(returns.map((r: any) => ({ id: r.reqId })));

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Reset page when changing filters
      if (!("page" in updates)) {
        params.delete("page");
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const handleTabChange = useCallback(
    (index: number) => {
      updateParams({ status: STATUS_TABS[index].id });
    },
    [updateParams],
  );

  const handleSearch = useCallback(() => {
    updateParams({ search: searchValue || null });
  }, [searchValue, updateParams]);

  const handleSearchKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleDateRangeChange = useCallback(
    (value: string) => {
      updateParams({ dateRange: value === "all" ? null : value });
    },
    [updateParams],
  );

  const handlePageChange = useCallback(
    (direction: "next" | "prev") => {
      const newPage =
        direction === "next"
          ? pagination.currentPage + 1
          : pagination.currentPage - 1;
      const params = new URLSearchParams(searchParams);
      params.set("page", String(newPage));
      setSearchParams(params);
    },
    [pagination.currentPage, searchParams, setSearchParams],
  );

  const handleBulkAction = useCallback(
    (intent: string) => {
      const formData = new FormData();
      formData.set("intent", intent);
      formData.set("reqIds", selectedResources.join(","));
      submit(formData, { method: "post" });
    },
    [selectedResources, submit],
  );

  const promotedBulkActions = [
    {
      content: "Approve",
      onAction: () => handleBulkAction("bulk_approve"),
    },
    {
      content: "Reject",
      onAction: () => handleBulkAction("bulk_reject"),
    },
  ];

  const getReturnId = (r: any) => {
    const prefix =
      r.requestType === "exchange"
        ? "EXC"
        : r.requestType === "mixed"
          ? "MIX"
          : "RET";
    const num = r.reqNum
      ? String(r.reqNum).padStart(3, "0")
      : (r.reqId || "").slice(-6).toUpperCase();
    return `${prefix}-${num}`;
  };

  const tabs = STATUS_TABS.map((tab) => ({
    ...tab,
  }));

  const rowMarkup = returns.map((r: any, index: number) => (
    <IndexTable.Row
      id={r.reqId}
      key={r.reqId}
      selected={selectedResources.includes(r.reqId)}
      position={index}
      onClick={() => navigate(`/app/returns/${r.reqId}`)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {getReturnId(r)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          #{r.orderNumber || r.orderId}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{r.customerName || "\u2014"}</IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={r.status} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{r.requestType}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(r.createdAt).toLocaleDateString("en-IN")}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: "+ Create new request",
        url: "/app/returns/new",
      }}
    >
      <BlockStack gap="500">
        {/* Row 1 - Stat Cards */}
        <InlineStack gap="400" wrap>
          <Box minWidth="200px" width="200px">
            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Returns (30d)
                </Text>
                <Text variant="headingXl" as="p">
                  {stats.totalReturns}
                </Text>
              </BlockStack>
            </Card>
          </Box>
          <Box minWidth="200px" width="200px">
            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Pending Approval
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingXl" as="p">
                    {stats.pendingCount}
                  </Text>
                  {stats.pendingCount > 0 && (
                    <Badge tone="attention">Needs action</Badge>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Box>
          <Box minWidth="200px" width="200px">
            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  In Transit
                </Text>
                <Text variant="headingXl" as="p">
                  {stats.inTransitCount}
                </Text>
              </BlockStack>
            </Card>
          </Box>
          <Box minWidth="200px" width="200px">
            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Refunded Amount
                </Text>
                <Text variant="headingXl" as="p">
                  {formatCurrency(stats.totalRefunded)}
                </Text>
              </BlockStack>
            </Card>
          </Box>
        </InlineStack>

        {/* Row 2-4: Tabs, Search, and Table */}
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs
                tabs={tabs}
                selected={selectedTab >= 0 ? selectedTab : STATUS_TABS.length - 1}
                onSelect={handleTabChange}
              >
                {/* Row 3 - Search + Date Filter */}
                <Box padding="400">
                  <InlineStack gap="300" blockAlign="center">
                    <Box width="100%">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label=""
                          labelHidden
                          placeholder="Search with request id or order id"
                          value={searchValue}
                          onChange={setSearchValue}
                          onBlur={handleSearch}
                          autoComplete="off"
                          clearButton
                          onClearButtonClick={() => {
                            setSearchValue("");
                            updateParams({ search: null });
                          }}
                          connectedRight={
                            <Button onClick={handleSearch}>Search</Button>
                          }
                        />
                      </div>
                    </Box>
                    <Box minWidth="180px">
                      <Select
                        label=""
                        labelHidden
                        options={DATE_RANGE_OPTIONS}
                        value={filters.dateRange}
                        onChange={handleDateRangeChange}
                      />
                    </Box>
                  </InlineStack>
                </Box>

                {/* Row 4 - IndexTable */}
                {returns.length === 0 ? (
                  <EmptyState
                    heading="No returns found"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      {filters.search
                        ? "Try adjusting your search or filters."
                        : "Returns will appear here when customers submit them."}
                    </p>
                  </EmptyState>
                ) : (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={returns.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    promotedBulkActions={promotedBulkActions}
                    headings={[
                      { title: "Request ID" },
                      { title: "Order" },
                      { title: "Customer" },
                      { title: "Status" },
                      { title: "Type" },
                      { title: "Date" },
                    ]}
                  >
                    {rowMarkup}
                  </IndexTable>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Pagination
                        hasPrevious={pagination.hasPrev}
                        onPrevious={() => handlePageChange("prev")}
                        hasNext={pagination.hasNext}
                        onNext={() => handlePageChange("next")}
                      />
                    </InlineStack>
                  </Box>
                )}
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
