import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useSubmit } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Tabs,
  TextField,
  InlineStack,
  BlockStack,
  Button,
  useIndexResourceState,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { approveRequest, rejectRequest } from "../services/returns.server";

const STATUS_TABS = [
  { id: "all", content: "All" },
  { id: "pending", content: "Pending" },
  { id: "approved", content: "Approved" },
  { id: "pickup_scheduled", content: "Pickup Scheduled" },
  { id: "delivered", content: "Delivered" },
  { id: "refunded", content: "Refunded" },
  { id: "archived", content: "Archived" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";

  const where: any = { shop };
  if (status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { reqId: { contains: search } },
    ];
  }

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const counts: Record<string, number> = {};
  for (const tab of STATUS_TABS) {
    if (tab.id === "all") {
      counts.all = await prisma.returnRequest.count({ where: { shop } });
    } else {
      counts[tab.id] = await prisma.returnRequest.count({
        where: { shop, status: tab.id },
      });
    }
  }

  return json({ returns, counts, status, search });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqIds = (formData.get("reqIds") as string || "").split(",").filter(Boolean);

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

export default function ReturnsList() {
  const { returns, counts, status, search } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);

  const selectedTab = STATUS_TABS.findIndex((t) => t.id === status);

  const resourceName = { singular: "return", plural: "returns" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(returns.map((r: any) => ({ id: r.reqId })));

  const handleTabChange = useCallback(
    (index: number) => {
      const tab = STATUS_TABS[index];
      const params = new URLSearchParams(searchParams);
      params.set("status", tab.id);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

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

  const tabs = STATUS_TABS.map((tab) => ({
    ...tab,
    content: `${tab.content} (${counts[tab.id] || 0})`,
  }));

  const getReturnId = (r: any) => {
    const prefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
    // Use last 6 chars of reqId for uniqueness
    const suffix = (r.reqId || "").slice(-6).toUpperCase();
    return `${prefix}-${suffix}`;
  };

  const rowMarkup = returns.map((r: any, index: number) => {
    const items = (r.items || []) as any[];
    return (
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
          <Text variant="bodyMd" fontWeight="bold" as="span">
            #{r.orderNumber || r.orderId}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {r.customerName || "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge>{r.requestType}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <StatusBadge status={r.status} />
        </IndexTable.Cell>
        <IndexTable.Cell>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </IndexTable.Cell>
        <IndexTable.Cell>
          ₹{Number(r.totalPrice).toLocaleString("en-IN")}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(r.createdAt).toLocaleDateString("en-IN")}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Returns"
      primaryAction={
        <Button variant="primary" url="/app/returns/new">
          Create Return
        </Button>
      }
    >
      <BlockStack gap="400">
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            <div style={{ padding: "16px" }}>
              <InlineStack gap="200">
                <div style={{ flex: 1 }}>
                  <TextField
                    label=""
                    labelHidden
                    placeholder="Search by order number, customer name, or request ID..."
                    value={searchValue}
                    onChange={setSearchValue}
                    onBlur={handleSearch}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => {
                      setSearchValue("");
                      const params = new URLSearchParams(searchParams);
                      params.delete("search");
                      setSearchParams(params);
                    }}
                  />
                </div>
                <Button onClick={handleSearch}>Search</Button>
              </InlineStack>
            </div>

            {returns.length === 0 ? (
              <EmptyState
                heading="No returns found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {search
                    ? "Try adjusting your search."
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
                  { title: "Return ID" },
                  { title: "Order" },
                  { title: "Customer" },
                  { title: "Type" },
                  { title: "Status" },
                  { title: "Items" },
                  { title: "Value" },
                  { title: "Date" },
                ]}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Tabs>
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
