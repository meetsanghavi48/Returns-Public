import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  List,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
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

/* ─── helpers ─── */

function getReturnId(r: any) {
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

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventIcon(type: string) {
  switch (type) {
    case "status_change":
      return "→";
    case "note":
      return "✎";
    case "tracking_update":
      return "⊕";
    case "refund_processed":
      return "₹";
    case "pickup_scheduled":
      return "↑";
    default:
      return "•";
  }
}

/* ─── LOADER ─── */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const returnReq = await prisma.returnRequest.findFirst({
    where: { shop, reqId: params.reqId },
  });

  if (!returnReq) {
    throw new Response("Not found", { status: 404 });
  }

  const events = await prisma.returnEvent.findMany({
    where: { shop, returnId: returnReq.id },
    orderBy: { createdAt: "desc" },
  });

  return json({ returnReq, events });
};

/* ─── ACTION ─── */

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
        await auditLog(
          shop,
          null,
          reqId,
          "awb_attached",
          "admin",
          `AWB:${awb}`,
        );
        return json({ ok: true, message: `AWB ${awb} attached` });
      }

      case "add_utr": {
        const utr = formData.get("utr") as string;
        if (!utr) return json({ error: "UTR required" }, { status: 400 });
        await prisma.returnRequest.update({
          where: { reqId, shop },
          data: { utrNumber: utr },
        });
        await auditLog(
          shop,
          null,
          reqId,
          "utr_added",
          "admin",
          `UTR:${utr}`,
        );
        return json({ ok: true, message: `UTR ${utr} added` });
      }

      case "add_note": {
        const note = formData.get("note") as string;
        if (!note) return json({ error: "Note is required" }, { status: 400 });
        const req = await prisma.returnRequest.findFirst({
          where: { shop, reqId },
        });
        if (!req) return json({ error: "Not found" }, { status: 404 });
        await prisma.returnEvent.create({
          data: {
            shop,
            returnId: req.id,
            type: "note",
            message: note,
            actor: "merchant",
          },
        });
        return json({ ok: true, message: "Note added" });
      }

      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};

/* ─── COMPONENT ─── */

export default function ReturnDetail() {
  const { returnReq, events } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const isLoading = fetcher.state === "submitting";

  const [rejectReason, setRejectReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [awbInput, setAwbInput] = useState("");
  const [utrInput, setUtrInput] = useState("");

  const r = returnReq as any;
  const items = (r.items || []) as any[];
  const address = (r.address || {}) as any;

  // Clear note input after successful submission
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data?.message === "Note added") {
      setNoteText("");
    }
  }, [fetcher.data]);

  return (
    <Page
      backAction={{ content: "Returns", url: "/app" }}
      title={`Return ${getReturnId(r)}`}
      titleMetadata={<StatusBadge status={r.status} />}
      subtitle={`Order ${r.orderNumber ? `#${r.orderNumber}` : r.orderId}`}
    >
      {fetcher.data?.error && (
        <Box paddingBlockEnd="400">
          <Banner tone="critical">{fetcher.data.error}</Banner>
        </Box>
      )}
      {fetcher.data?.ok && fetcher.data.message && (
        <Box paddingBlockEnd="400">
          <Banner tone="success">{fetcher.data.message}</Banner>
        </Box>
      )}

      <Layout>
        {/* ─── Main content — left column (2/3) ─── */}
        <Layout.Section>
          {/* Card: Items */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Items ({items.length})
              </Text>
              <Divider />
              {items.length === 0 ? (
                <Text as="p" tone="subdued">
                  No items found.
                </Text>
              ) : (
                items.map((item: any, idx: number) => (
                  <Box key={idx}>
                    <InlineStack
                      gap="300"
                      align="space-between"
                      blockAlign="start"
                    >
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">
                          {item.title}
                        </Text>
                        {item.variant_title && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            {item.variant_title}
                          </Text>
                        )}
                        <Text as="span" variant="bodySm" tone="subdued">
                          Qty: {item.qty || 1}
                        </Text>
                        {item.reason && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Reason: {item.reason}
                          </Text>
                        )}
                      </BlockStack>
                      <BlockStack gap="100" inlineAlign="end">
                        <Text as="span">
                          {"\u20B9"}
                          {Number(item.price || 0).toLocaleString("en-IN")}
                        </Text>
                        <Badge
                          tone={item.action === "exchange" ? "info" : undefined}
                        >
                          {item.action || "return"}
                        </Badge>
                      </BlockStack>
                    </InlineStack>
                    {idx < items.length - 1 && <Divider />}
                  </Box>
                ))
              )}
              <Divider />
              <InlineStack align="space-between">
                <Text as="span" fontWeight="bold">
                  Total
                </Text>
                <Text as="span" fontWeight="bold">
                  {"\u20B9"}
                  {Number(r.totalPrice).toLocaleString("en-IN")}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Card: Timeline */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Timeline
              </Text>
              <Divider />
              {(events as any[]).length === 0 ? (
                <Text as="p" tone="subdued">
                  No events yet.
                </Text>
              ) : (
                (events as any[]).map((ev: any) => (
                  <Box key={ev.id}>
                    <InlineStack gap="300" align="space-between" blockAlign="start">
                      <InlineStack gap="200" blockAlign="start">
                        <Text as="span" variant="bodySm">
                          {eventIcon(ev.type)}
                        </Text>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {ev.message || ev.type}
                          </Text>
                          {ev.actor && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              by {ev.actor}
                            </Text>
                          )}
                        </BlockStack>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {formatDate(ev.createdAt)}
                      </Text>
                    </InlineStack>
                  </Box>
                ))
              )}
            </BlockStack>
          </Card>

          {/* Card: Add Note */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Add Note
              </Text>
              <Divider />
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="add_note" />
                <BlockStack gap="200">
                  <TextField
                    label="Note"
                    labelHidden
                    value={noteText}
                    onChange={setNoteText}
                    multiline={3}
                    autoComplete="off"
                    placeholder="Add a note to the timeline..."
                  />
                  <InlineStack align="end">
                    <Button
                      submit
                      disabled={!noteText.trim()}
                      loading={isLoading}
                    >
                      Add Note
                    </Button>
                  </InlineStack>
                </BlockStack>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ─── Sidebar — right column (1/3) ─── */}
        <Layout.Section variant="oneThird">
          {/* Card: Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Actions
              </Text>
              <Divider />
              <BlockStack gap="200">
                {r.status === "pending" && (
                  <>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <Button
                        submit
                        variant="primary"
                        fullWidth
                        loading={isLoading}
                      >
                        Approve
                      </Button>
                    </fetcher.Form>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="reject" />
                      <BlockStack gap="200">
                        <TextField
                          label="Rejection reason"
                          value={rejectReason}
                          onChange={setRejectReason}
                          autoComplete="off"
                          name="reason"
                          placeholder="Optional reason..."
                        />
                        <Button
                          submit
                          tone="critical"
                          fullWidth
                          loading={isLoading}
                        >
                          Reject
                        </Button>
                      </BlockStack>
                    </fetcher.Form>
                  </>
                )}

                {r.status === "approved" && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="create_pickup" />
                    <Button
                      submit
                      variant="primary"
                      fullWidth
                      loading={isLoading}
                    >
                      Create Pickup
                    </Button>
                  </fetcher.Form>
                )}

                {["delivered", "received"].includes(r.status) && (
                  <fetcher.Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="process_refund"
                    />
                    <Button submit fullWidth loading={isLoading}>
                      Process Refund
                    </Button>
                  </fetcher.Form>
                )}

                {["delivered", "pickup_scheduled", "in_transit"].includes(
                  r.status,
                ) &&
                  (r.requestType === "exchange" ||
                    r.requestType === "mixed") &&
                  !r.exchangeOrderId && (
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="create_exchange"
                      />
                      <Button submit fullWidth loading={isLoading}>
                        Create Exchange Order
                      </Button>
                    </fetcher.Form>
                  )}

                {r.status !== "archived" && r.status !== "pending" && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="archive" />
                    <Button submit fullWidth loading={isLoading}>
                      Archive
                    </Button>
                  </fetcher.Form>
                )}

                {r.status === "archived" && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="unarchive" />
                    <Button submit fullWidth loading={isLoading}>
                      Unarchive
                    </Button>
                  </fetcher.Form>
                )}
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Card: Customer */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Customer
              </Text>
              <Divider />
              <BlockStack gap="200">
                {r.customerName && (
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">
                      Name:
                    </Text>
                    <Text as="span">{r.customerName}</Text>
                  </InlineStack>
                )}
                {r.customerEmail && (
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">
                      Email:
                    </Text>
                    <Text as="span">{r.customerEmail}</Text>
                  </InlineStack>
                )}
                {address.phone && (
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">
                      Phone:
                    </Text>
                    <Text as="span">{address.phone}</Text>
                  </InlineStack>
                )}
              </BlockStack>
              {(address.address1 || address.city) && (
                <>
                  <Divider />
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold" variant="bodySm">
                      Shipping Address
                    </Text>
                    {address.name && (
                      <Text as="span" variant="bodySm">
                        {address.name}
                      </Text>
                    )}
                    {address.address1 && (
                      <Text as="span" variant="bodySm">
                        {address.address1}
                      </Text>
                    )}
                    {address.address2 && (
                      <Text as="span" variant="bodySm">
                        {address.address2}
                      </Text>
                    )}
                    <Text as="span" variant="bodySm">
                      {[address.city, address.province, address.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </Card>

          {/* Card: Logistics */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Logistics
              </Text>
              <Divider />
              {r.awb ? (
                <BlockStack gap="200">
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">
                      AWB:
                    </Text>
                    <Text as="span" fontWeight="bold">
                      {r.awb}
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Text as="span" tone="subdued">
                      Carrier:
                    </Text>
                    <Text as="span">Delhivery</Text>
                  </InlineStack>
                  {r.awbStatus && (
                    <InlineStack gap="200">
                      <Text as="span" tone="subdued">
                        Status:
                      </Text>
                      <Text as="span">{r.awbStatus}</Text>
                    </InlineStack>
                  )}
                  <Button
                    url={`https://www.delhivery.com/track/package/${r.awb}`}
                    target="_blank"
                    fullWidth
                  >
                    Track Shipment
                  </Button>
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">
                    No AWB attached yet.
                  </Text>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="attach_awb" />
                    <BlockStack gap="200">
                      <TextField
                        label="Attach AWB manually"
                        value={awbInput}
                        onChange={setAwbInput}
                        autoComplete="off"
                        name="awb"
                      />
                      <Button
                        submit
                        disabled={!awbInput.trim()}
                        loading={isLoading}
                        fullWidth
                      >
                        Attach AWB
                      </Button>
                    </BlockStack>
                  </fetcher.Form>
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          {/* Card: Refund */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Refund
              </Text>
              <Divider />
              <InlineStack gap="200">
                <Text as="span" tone="subdued">
                  Method:
                </Text>
                <Text as="span">
                  {r.refundMethod === "store_credit"
                    ? "Store Credit"
                    : r.refundMethod === "original"
                      ? "Original Payment"
                      : r.refundMethod || "—"}
                </Text>
              </InlineStack>
              <InlineStack gap="200">
                <Text as="span" tone="subdued">
                  Amount:
                </Text>
                <Text as="span" fontWeight="bold">
                  {r.refundAmount
                    ? `\u20B9${Number(r.refundAmount).toLocaleString("en-IN")}`
                    : "—"}
                </Text>
              </InlineStack>
              <InlineStack gap="200">
                <Text as="span" tone="subdued">
                  Status:
                </Text>
                <Text as="span">
                  {r.refundId ? "Processed" : "Not processed"}
                </Text>
              </InlineStack>
              {r.utrNumber ? (
                <InlineStack gap="200">
                  <Text as="span" tone="subdued">
                    UTR:
                  </Text>
                  <Text as="span">{r.utrNumber}</Text>
                </InlineStack>
              ) : (
                r.refundId && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="add_utr" />
                    <BlockStack gap="200">
                      <TextField
                        label="Add UTR Number"
                        value={utrInput}
                        onChange={setUtrInput}
                        autoComplete="off"
                        name="utr"
                      />
                      <Button
                        submit
                        disabled={!utrInput.trim()}
                        loading={isLoading}
                        fullWidth
                      >
                        Add UTR
                      </Button>
                    </BlockStack>
                  </fetcher.Form>
                )
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
