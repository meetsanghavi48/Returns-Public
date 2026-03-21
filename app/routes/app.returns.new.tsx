import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Checkbox,
  Select,
  Divider,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { submitManualRequest } from "../services/returns.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "lookup") {
    const orderNumber = (formData.get("orderNumber") as string || "").replace(/^#+/, "").trim();
    if (!orderNumber) return json({ error: "Enter an order number" });

    // Search for order via GraphQL
    const response = await admin.graphql(`
      query SearchOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              legacyResourceId
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              customer { id firstName lastName email }
              shippingAddress { address1 address2 city province zip country phone name }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    variantTitle
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                    variant { id }
                    image { url }
                  }
                }
              }
              tags
            }
          }
        }
      }
    `, { variables: { query: `name:#${orderNumber}` } });

    const data = await response.json();
    const order = data?.data?.orders?.edges?.[0]?.node;
    if (!order) return json({ error: `Order #${orderNumber} not found` });

    return json({
      order: {
        id: order.legacyResourceId,
        gid: order.id,
        name: order.name,
        financial_status: order.displayFinancialStatus,
        fulfillment_status: order.displayFulfillmentStatus,
        total_price: order.totalPriceSet?.shopMoney?.amount,
        customer: order.customer,
        shipping_address: order.shippingAddress,
        tags: order.tags?.join(", ") || "",
        line_items: order.lineItems.edges.map((e: any) => ({
          id: e.node.id.replace(/^gid:\/\/shopify\/LineItem\//, ""),
          title: e.node.title,
          variant_title: e.node.variantTitle,
          quantity: e.node.quantity,
          price: e.node.originalUnitPriceSet?.shopMoney?.amount || "0",
          variant_id: e.node.variant?.id?.replace(/^gid:\/\/shopify\/ProductVariant\//, ""),
          image_url: e.node.image?.url,
        })),
      },
    });
  }

  if (intent === "create") {
    const orderData = JSON.parse(formData.get("orderData") as string);
    const selectedItems = JSON.parse(formData.get("selectedItems") as string);

    const reqId = await submitManualRequest(shop, session.accessToken!, {
      orderId: orderData.id,
      orderNumber: orderData.name?.replace("#", ""),
      items: selectedItems,
      refundMethod: (formData.get("refundMethod") as string) || "original",
      address: orderData.shipping_address,
    });

    return json({ created: true, reqId });
  }

  return json({ error: "Unknown action" });
};

export default function NewReturn() {
  const submit = useSubmit();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [orderNumber, setOrderNumber] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; action: string; reason: string; qty: number }>>({});
  const [refundMethod, setRefundMethod] = useState("original");

  const order = actionData?.order;
  const error = actionData?.error;

  const handleLookup = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "lookup");
    formData.set("orderNumber", orderNumber);
    submit(formData, { method: "post" });
  }, [orderNumber, submit]);

  const toggleItem = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      const existing = prev[itemId];
      if (existing?.selected) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { selected: true, action: "return", reason: "", qty: 1 } };
    });
  }, []);

  const handleCreate = useCallback(() => {
    if (!order) return;
    const items = order.line_items
      .filter((li: any) => selectedItems[li.id]?.selected)
      .map((li: any) => ({
        id: li.id,
        title: li.title,
        variant_title: li.variant_title,
        variant_id: li.variant_id,
        price: li.price,
        qty: selectedItems[li.id]?.qty || 1,
        action: selectedItems[li.id]?.action || "return",
        reason: selectedItems[li.id]?.reason || "",
      }));

    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("orderData", JSON.stringify(order));
    formData.set("selectedItems", JSON.stringify(items));
    formData.set("refundMethod", refundMethod);
    submit(formData, { method: "post" });
  }, [order, selectedItems, refundMethod, submit]);

  if (actionData?.created) {
    return (
      <Page title="Create Return" backAction={{ url: "/app/returns" }}>
        <Banner tone="success" title="Return created successfully">
          <p>
            Request ID: {actionData.reqId}.{" "}
            <a href={`/app/returns/${actionData.reqId}`}>View details</a>
          </p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="Create Return" backAction={{ url: "/app/returns" }}>
      <Layout>
        <Layout.Section>
          {/* Order Lookup */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Look up order</Text>
              <InlineStack gap="200">
                <div style={{ flex: 1 }}>
                  <TextField
                    label=""
                    labelHidden
                    placeholder="Enter order number (e.g. 1001)"
                    value={orderNumber}
                    onChange={setOrderNumber}
                    autoComplete="off"
                    onBlur={handleLookup}
                  />
                </div>
                <Button onClick={handleLookup} loading={isLoading}>
                  Look up
                </Button>
              </InlineStack>
              {error && <Banner tone="critical">{error}</Banner>}
            </BlockStack>
          </Card>

          {/* Order Details & Item Selection */}
          {order && (
            <>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Order {order.name}
                  </Text>
                  <Text as="p" tone="subdued">
                    {order.customer?.firstName} {order.customer?.lastName} &middot;{" "}
                    {order.financial_status} &middot; ₹{order.total_price}
                  </Text>
                  <Divider />
                  <Text as="h3" variant="headingSm">
                    Select items to return
                  </Text>
                  {order.line_items.map((li: any) => {
                    const sel = selectedItems[li.id];
                    return (
                      <BlockStack key={li.id} gap="200">
                        <InlineStack gap="300" blockAlign="center">
                          <Checkbox
                            label=""
                            labelHidden
                            checked={!!sel?.selected}
                            onChange={() => toggleItem(li.id)}
                          />
                          <BlockStack gap="050">
                            <Text as="span" fontWeight="semibold">
                              {li.title}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {li.variant_title || ""} &middot; ₹{li.price} &middot; Qty: {li.quantity}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        {sel?.selected && (
                          <InlineStack gap="200">
                            <Select
                              label="Action"
                              options={[
                                { label: "Return", value: "return" },
                                { label: "Exchange", value: "exchange" },
                              ]}
                              value={sel.action}
                              onChange={(v) =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [li.id]: { ...prev[li.id], action: v },
                                }))
                              }
                            />
                            <TextField
                              label="Qty"
                              type="number"
                              value={String(sel.qty)}
                              onChange={(v) =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [li.id]: { ...prev[li.id], qty: Math.min(parseInt(v) || 1, li.quantity) },
                                }))
                              }
                              autoComplete="off"
                            />
                          </InlineStack>
                        )}
                      </BlockStack>
                    );
                  })}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Select
                    label="Refund method"
                    options={[
                      { label: "Original payment", value: "original" },
                      { label: "Store credit", value: "store_credit" },
                    ]}
                    value={refundMethod}
                    onChange={setRefundMethod}
                  />
                  <Button
                    variant="primary"
                    onClick={handleCreate}
                    loading={isLoading}
                    disabled={Object.values(selectedItems).filter((s) => s.selected).length === 0}
                  >
                    Create Return Request
                  </Button>
                </BlockStack>
              </Card>
            </>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
