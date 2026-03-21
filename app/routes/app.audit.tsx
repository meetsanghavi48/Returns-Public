import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  DataTable,
  TextField,
  InlineStack,
  Button,
  BlockStack,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  const where: any = { shop };
  if (search) {
    where.OR = [
      { orderId: { contains: search } },
      { reqId: { contains: search } },
      { action: { contains: search, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return json({ logs, search });
};

export default function AuditLog() {
  const { logs, search } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  const rows = logs.map((log: any) => [
    new Date(log.createdAt).toLocaleString("en-IN"),
    log.orderId || "—",
    log.reqId || "—",
    log.action,
    log.actor || "system",
    (log.details || "").slice(0, 80),
  ]);

  return (
    <Page title="Audit Log">
      <BlockStack gap="400">
        <Card>
          <InlineStack gap="200">
            <div style={{ flex: 1 }}>
              <TextField
                label=""
                labelHidden
                placeholder="Search by order ID, request ID, or action..."
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
        </Card>

        <Card>
          {logs.length === 0 ? (
            <EmptyState
              heading="No audit entries"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Audit log entries will appear here as actions are taken on return requests.</p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["Date", "Order", "Request", "Action", "Actor", "Details"]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
