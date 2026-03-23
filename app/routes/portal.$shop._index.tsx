import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, Form, useNavigation, Link, useParams } from "@remix-run/react";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";
import { getSetting } from "../services/settings.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({ shop: params.shop });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const shopDomain = params.shop!;
  const formData = await request.formData();
  const orderNumber = (formData.get("orderNumber") as string || "").replace(/^#+/, "").trim();
  const pincode = (formData.get("pincode") as string || "").trim();

  if (!orderNumber) return json({ error: "Please enter your order number." });
  if (!pincode) return json({ error: "Please enter your pincode for verification." });

  // Get shop's access token
  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) return json({ error: "Store not found." });

  // Lookup order via REST API
  const result = await shopifyREST(
    shopDomain,
    shopRecord.accessToken,
    "GET",
    `orders.json?name=%23${orderNumber}&status=any&fields=id,order_number,name,tags,shipping_address,line_items,created_at,fulfillments,financial_status,customer`,
  );

  const order = result?.orders?.[0];
  if (!order) return json({ error: `Order #${orderNumber} not found.` });

  // Verify pincode
  const orderPincode = order.shipping_address?.zip || "";
  if (pincode !== orderPincode) {
    return json({ error: "Pincode does not match the shipping address on this order." });
  }

  // Check return window
  const returnWindowDays = await getSetting<number>(shopDomain, "return_window_days", 30);
  const orderDate = new Date(order.created_at);
  const daysSince = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince > returnWindowDays) {
    return json({
      error: `This order is ${daysSince} days old. The return window is ${returnWindowDays} days.`,
    });
  }

  // Find existing active returns for this order — collect already-returned item IDs
  const existingReturns = await prisma.returnRequest.findMany({
    where: {
      shop: shopDomain,
      orderId: String(order.id),
      status: { notIn: ["archived", "rejected"] },
    },
  });

  const returnedItemIds: string[] = [];
  for (const ret of existingReturns) {
    const items = (ret.items as any[]) || [];
    for (const item of items) {
      returnedItemIds.push(String(item.id));
    }
  }

  // Check if ALL items are already in active returns
  const allLineItemIds = (order.line_items || []).map((li: any) => String(li.id));
  const allReturned = allLineItemIds.length > 0 && allLineItemIds.every((id: string) => returnedItemIds.includes(id));

  if (allReturned && existingReturns.length > 0) {
    // All items already have active returns — redirect to the latest one
    return redirect(`/portal/${shopDomain}/tracking/${existingReturns[0].reqId}`);
  }

  // Pass order data to next step via URL params (encoded)
  const orderData = encodeURIComponent(
    JSON.stringify({
      id: String(order.id),
      name: order.name,
      order_number: order.order_number,
      tags: order.tags || "",
      shipping_address: order.shipping_address,
      customer: order.customer,
      financial_status: order.financial_status,
      days_since: daysSince,
      is_cod: (order.financial_status || "").toLowerCase().includes("pending"),
      returned_item_ids: returnedItemIds,
      line_items: (order.line_items || []).map((li: any) => ({
        id: String(li.id),
        title: li.title,
        variant_title: li.variant_title,
        variant_id: li.variant_id,
        product_id: li.product_id,
        price: li.price,
        quantity: li.quantity,
        image_url: li.image?.src || null,
      })),
    }),
  );

  return redirect(`/portal/${shopDomain}/request?order=${orderData}`);
};

export default function PortalLookup() {
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const { shop } = useParams();

  return (
    <>
      {/* Breadcrumb navigation */}
      <div className="portal-breadcrumbs">
        <span className="portal-breadcrumb active">Find Order</span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb">Select Items</span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb">Confirm</span>
      </div>

      <div className="portal-card">
        <h2>Find Your Order</h2>
        <p style={{ color: "var(--portal-text-muted)", marginBottom: 20, fontSize: 14 }}>
          Enter your order number and shipping pincode to start a return or exchange.
        </p>

        {actionData?.error && (
          <div className="portal-error">{actionData.error}</div>
        )}

        <Form method="post">
          <div className="portal-field">
            <label className="portal-label">Order Number</label>
            <input
              className="portal-input"
              name="orderNumber"
              type="text"
              placeholder="e.g. 1001"
              required
            />
          </div>
          <div className="portal-field">
            <label className="portal-label">Shipping Pincode</label>
            <input
              className="portal-input"
              name="pincode"
              type="text"
              placeholder="e.g. 400001"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </div>
          <button
            className="portal-btn portal-btn-primary"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Looking up..." : "Find My Order"}
          </button>
        </Form>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link
          to={`/portal/${shop}/tracking`}
          style={{ color: "var(--portal-accent)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
        >
          Already submitted a return? Track your requests →
        </Link>
      </div>
    </>
  );
}
