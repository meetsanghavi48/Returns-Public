import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Divider,
  Box,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  approveRequest,
  rejectRequest,
  archiveRequest,
} from "../services/returns.server";
import { processRefund } from "../services/refunds.server";
import { createExchangeOrder } from "../services/exchanges.server";
import { createDelhiveryPickup } from "../services/delhivery.server";
import { auditLog } from "../services/audit.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const returnReq = await prisma.returnRequest.findFirst({
    where: { shop, reqId: params.reqId },
  });

  if (!returnReq) {
    throw new Response("Not found", { status: 404 });
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: { shop, reqId: params.reqId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return json({ returnReq, auditLogs });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const accessToken = session.accessToken!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reqId = params.reqId!;

  try {
    switch (intent) {
      case "approve":
        await approveRequest(shop, accessToken, reqId);
        return json({ ok: true, message: "Request approved" });

      case "reject": {
        const reason = (formData.get("reason") as string) || "";
        await rejectRequest(shop, accessToken, reqId, reason);
        return json({ ok: true, message: "Request rejected" });
      }

      case "create_pickup": {
        const req = await prisma.returnRequest.findFirst({
          where: { shop, reqId },
        });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        await createDelhiveryPickup(shop, accessToken, req);
        return json({ ok: true, message: "Pickup created" });
      }

      case "process_refund": {
        const req = await prisma.returnRequest.findFirst({
          where: { shop, reqId },
        });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        const result = await processRefund(shop, accessToken, req);
        return json({
          ok: true,
          message: result
            ? `Refund processed: ₹${result.amount}`
            : "Refund failed",
        });
      }

      case "create_exchange": {
        const req = await prisma.returnRequest.findFirst({
          where: { shop, reqId },
        });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        const result = await createExchangeOrder(shop, accessToken, req);
        return json({
          ok: true,
          message: result
            ? `Exchange created: ${result.order_name}`
            : "Exchange failed",
        });
      }

      case "archive":
        await archiveRequest(shop, reqId);
        return json({ ok: true, message: "Request archived" });

      case "unarchive":
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { status: "delivered", archivedAt: null },
        });
        await auditLog(shop, null, reqId, "unarchived", "admin", "");
        return json({ ok: true, message: "Request unarchived" });

      case "attach_awb": {
        const awb = formData.get("awb") as string;
        if (!awb) return json({ error: "AWB required" }, { status: 400 });
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: {
            awb,
            awbStatus: "Manually attached",
            status: "pickup_scheduled",
          },
        });
        await auditLog(shop, null, reqId, "awb_attached", "admin", `AWB:${awb}`);
        return json({ ok: true, message: `AWB ${awb} attached` });
      }

      case "add_utr": {
        const utr = formData.get("utr") as string;
        if (!utr) return json({ error: "UTR required" }, { status: 400 });
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { utrNumber: utr },
        });
        await auditLog(shop, null, reqId, "utr_added", "admin", `UTR:${utr}`);
        return json({ ok: true, message: `UTR ${utr} added` });
      }

      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};

export default function ReturnDetail() {
  const { returnReq, auditLogs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [awbInput, setAwbInput] = useState("");
  const [utrInput, setUtrInput] = useState("");

  const r = returnReq as any;
  const items = (r.items || []) as any[];

  const returnIdPrefix = r.requestType === "exchange" ? "EXC" : r.requestType === "mixed" ? "MIX" : "RET";
  const returnIdSuffix = (r.reqId || "").slice(-6).toUpperCase();
  const displayReturnId = `${returnIdPrefix}-${returnIdSuffix}`;

  const doAction = (intent: string, extra?: Record<string, string>) => {
    const formData = new FormData();
    formData.set("intent", intent);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        formData.set(k, v);
      }
    }
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title={`${displayReturnId} — Order #${r.orderNumber || r.orderId}`}
      subtitle={`${r.customerName || ""} • ${r.customerEmail || ""}`}
      backAction={{ url: "/app/returns" }}
    >
      <Layout>
        {/* Left column */}
        <Layout.Section>
          {/* Order Info */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Order Details
              </Text>
              <Divider />
              <InlineStack gap="400">
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Order ID</Text>
                  <Text as="span">{r.orderId}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Order #</Text>
                  <Text as="span">#{r.orderNumber}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Customer</Text>
                  <Text as="span">{r.customerName || "—"}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Type</Text>
                  <Badge>{r.requestType}</Badge>
                </BlockStack>
              </InlineStack>
              {r.isCod && (
                <Banner tone="warning">This is a Cash on Delivery order</Banner>
              )}
            </BlockStack>
          </Card>

          {/* Line Items */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Items ({items.length})
              </Text>
              <Divider />
              {items.map((item: any, idx: number) => (
                <InlineStack key={idx} gap="300" align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">
                      {item.title}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {item.variant_title || ""} &middot; Qty: {item.qty || 1}
                    </Text>
                    {item.reason && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        Reason: {item.reason}
                      </Text>
                    )}
                  </BlockStack>
                  <InlineStack gap="200">
                    <Text as="span">₹{item.price}</Text>
                    <Badge tone={item.action === "exchange" ? "info" : undefined}>
                      {item.action}
                    </Badge>
                  </InlineStack>
                </InlineStack>
              ))}
              <Divider />
              <InlineStack align="space-between">
                <Text as="span" fontWeight="bold">Total</Text>
                <Text as="span" fontWeight="bold">
                  ₹{Number(r.totalPrice).toLocaleString("en-IN")}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Audit Log */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Audit Log</Text>
              <Divider />
              {auditLogs.length === 0 ? (
                <Text as="p" tone="subdued">No audit entries yet.</Text>
              ) : (
                auditLogs.map((log: any) => (
                  <InlineStack key={log.id} gap="300" align="space-between">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {log.action}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {log.details}
                      </Text>
                    </BlockStack>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </Text>
                  </InlineStack>
                ))
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right column */}
        <Layout.Section variant="oneThird">
          {/* Status + Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Status</Text>
              <StatusBadge status={r.status} />

              {r.refundMethod && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Refund method: {r.refundMethod === "store_credit" ? "Store Credit" : "Original Payment"}
                </Text>
              )}

              <Divider />

              {/* Action buttons based on status */}
              <BlockStack gap="200">
                {r.status === "pending" && (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => doAction("approve")}
                      loading={isLoading}
                    >
                      Approve
                    </Button>
                    <Button
                      tone="critical"
                      onClick={() => doAction("reject")}
                      loading={isLoading}
                    >
                      Reject
                    </Button>
                  </>
                )}

                {r.status === "approved" && !r.awb && (
                  <Button
                    variant="primary"
                    onClick={() => doAction("create_pickup")}
                    loading={isLoading}
                  >
                    Create Pickup
                  </Button>
                )}

                {["delivered", "pickup_scheduled", "in_transit"].includes(r.status) && (
                  <>
                    {r.requestType !== "exchange" && !r.refundId && (
                      <Button
                        onClick={() => doAction("process_refund")}
                        loading={isLoading}
                      >
                        Process Refund
                      </Button>
                    )}
                    {(r.requestType === "exchange" || r.requestType === "mixed") &&
                      !r.exchangeOrderId && (
                        <Button
                          onClick={() => doAction("create_exchange")}
                          loading={isLoading}
                        >
                          Create Exchange Order
                        </Button>
                      )}
                  </>
                )}

                {r.status !== "archived" && r.status !== "pending" && (
                  <Button
                    onClick={() => doAction("archive")}
                    loading={isLoading}
                  >
                    Archive
                  </Button>
                )}

                {r.status === "archived" && (
                  <Button
                    onClick={() => doAction("unarchive")}
                    loading={isLoading}
                  >
                    Unarchive
                  </Button>
                )}
              </BlockStack>
            </BlockStack>
          </Card>

          {/* AWB Tracking */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tracking</Text>
              <Divider />
              {r.awb ? (
                <BlockStack gap="200">
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">AWB:</Text>
                    <Text as="span" fontWeight="bold">{r.awb}</Text>
                  </InlineStack>
                  {r.awbStatus && (
                    <InlineStack gap="200">
                      <Text as="span" tone="subdued">Status:</Text>
                      <Text as="span">{r.awbStatus}</Text>
                    </InlineStack>
                  )}
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">No AWB attached yet.</Text>
                  <TextField
                    label="Attach AWB manually"
                    value={awbInput}
                    onChange={setAwbInput}
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => doAction("attach_awb", { awb: awbInput })}
                    disabled={!awbInput}
                    loading={isLoading}
                  >
                    Attach AWB
                  </Button>
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          {/* Exchange Order */}
          {r.exchangeOrderId && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Exchange Order</Text>
                <Divider />
                <InlineStack gap="200">
                  <Text as="span" tone="subdued">Our #:</Text>
                  <Text as="span" fontWeight="bold">{r.exchangeOrderName}</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text as="span" tone="subdued">Shopify:</Text>
                  <Text as="span">{r.exchangeShopifyName}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Refund Info */}
          {r.refundId && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Refund</Text>
                <Divider />
                <InlineStack gap="200">
                  <Text as="span" tone="subdued">Amount:</Text>
                  <Text as="span" fontWeight="bold">
                    ₹{Number(r.refundAmount).toLocaleString("en-IN")}
                  </Text>
                </InlineStack>
                {r.utrNumber ? (
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">UTR:</Text>
                    <Text as="span">{r.utrNumber}</Text>
                  </InlineStack>
                ) : (
                  <BlockStack gap="200">
                    <TextField
                      label="Add UTR Number"
                      value={utrInput}
                      onChange={setUtrInput}
                      autoComplete="off"
                    />
                    <Button
                      onClick={() => doAction("add_utr", { utr: utrInput })}
                      disabled={!utrInput}
                      loading={isLoading}
                    >
                      Add UTR
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
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
