import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, Form, useNavigation, Link, useParams, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";
import { getSetting, getAllSettings } from "../services/settings.server";
import { validateOrderEligibility } from "../services/policies.server";
import crypto from "crypto";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const shopDomain = params.shop!;
  const enableOtp = await getSetting<boolean>(shopDomain, "enable_email_otp", false);
  return json({ shop: shopDomain, enableOtp });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const shopDomain = params.shop!;
  const formData = await request.formData();
  const intent = (formData.get("intent") as string) || "lookup";

  // OTP Send
  if (intent === "send_otp") {
    const email = (formData.get("email") as string || "").trim().toLowerCase();
    if (!email) return json({ error: "Please enter your email address." });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.otpSession.create({
      data: { shop: shopDomain, email, otp, expiresAt },
    });

    // Send OTP email
    try {
      const { sendNotification } = await import("../services/email-templates.server");
      await sendNotification(shopDomain, "otp", null, { otp, customer_email: email });
    } catch (e) {
      console.error("[OTP email]", e);
    }

    return json({ otpSent: true, otpEmail: email });
  }

  // OTP Verify
  if (intent === "verify_otp") {
    const email = (formData.get("email") as string || "").trim().toLowerCase();
    const otp = (formData.get("otp") as string || "").trim();
    if (!email || !otp) return json({ error: "Please enter the OTP." });

    const session = await prisma.otpSession.findFirst({
      where: { shop: shopDomain, email, otp, used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!session) return json({ error: "Invalid or expired OTP. Please try again.", otpSent: true, otpEmail: email });

    // Mark OTP as used
    await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });

    // Fetch all orders for this email
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shopRecord) return json({ error: "Store not found." });

    const result = await shopifyREST(shopDomain, shopRecord.accessToken, "GET",
      `orders.json?email=${encodeURIComponent(email)}&status=any&limit=25&fields=id,order_number,name,tags,shipping_address,line_items,created_at,fulfillments,financial_status,customer,total_price,discount_codes`);
    const orders = result?.orders || [];
    if (!orders.length) return json({ error: "No orders found for this email.", otpSent: true, otpEmail: email });

    return json({
      otpVerified: true,
      otpEmail: email,
      orders: orders.map((o: any) => ({
        id: String(o.id),
        name: o.name,
        order_number: o.order_number,
        created_at: o.created_at,
        total_price: o.total_price,
        financial_status: o.financial_status,
        item_count: (o.line_items || []).length,
      })),
    });
  }

  // Standard lookup flow
  const orderNumber = (formData.get("orderNumber") as string || "").replace(/^#+/, "").trim();
  const pincode = (formData.get("pincode") as string || "").trim();
  const email = (formData.get("email") as string || "").trim();

  if (!orderNumber) return json({ error: "Please enter your order number." });

  // Get shop's access token
  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) return json({ error: "Store not found." });

  const enableOtp = await getSetting<boolean>(shopDomain, "enable_email_otp", false);

  // Verify identity: OTP mode uses email, standard mode uses pincode
  if (enableOtp) {
    if (!email) return json({ error: "Please enter your email address." });
  } else {
    if (!pincode) return json({ error: "Please enter your pincode for verification." });
  }

  // Lookup order via REST API
  const result = await shopifyREST(
    shopDomain,
    shopRecord.accessToken,
    "GET",
    `orders.json?name=%23${orderNumber}&status=any&fields=id,order_number,name,tags,shipping_address,line_items,created_at,fulfillments,financial_status,customer,total_price,discount_codes`,
  );

  const order = result?.orders?.[0];
  if (!order) return json({ error: `Order #${orderNumber} not found.` });

  // Verify identity
  if (enableOtp) {
    const orderEmail = order.customer?.email || "";
    if (email.toLowerCase() !== orderEmail.toLowerCase()) {
      return json({ error: "Email does not match the email on this order." });
    }
  } else {
    const orderPincode = order.shipping_address?.zip || "";
    if (pincode !== orderPincode) {
      return json({ error: "Pincode does not match the shipping address on this order." });
    }
  }

  // Fetch product tags for line items (needed for tag-based restrictions)
  const productIds = [...new Set((order.line_items || []).map((li: any) => li.product_id).filter(Boolean))];
  const productTagsMap: Record<string, string> = {};
  for (const pid of productIds) {
    try {
      const pResult = await shopifyREST(shopDomain, shopRecord.accessToken, "GET", `products/${pid}.json?fields=id,tags`);
      if (pResult?.product?.tags) {
        productTagsMap[String(pid)] = pResult.product.tags;
      }
    } catch { /* ignore individual product fetch errors */ }
  }
  // Attach product tags to line items
  for (const li of order.line_items || []) {
    li.product_tags = productTagsMap[String(li.product_id)] || "";
  }

  // Get store currency
  const shopInfo = await shopifyREST(shopDomain, shopRecord.accessToken, "GET", "shop.json?fields=currency");
  const currency = shopInfo?.shop?.currency || "USD";

  // Calculate days since order
  const orderDate = new Date(order.created_at);
  const daysSince = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

  // Run full policy validation
  const policy = await validateOrderEligibility(shopDomain, {
    id: String(order.id),
    order_number: order.order_number,
    tags: order.tags || "",
    financial_status: order.financial_status,
    total_price: order.total_price,
    discount_codes: order.discount_codes,
    fulfillments: order.fulfillments,
    line_items: order.line_items,
  }, daysSince);

  // If blocked by multiple returns policy, redirect to tracking
  if (policy.multipleReturnsMode === "blocked" && policy.existingRequestId) {
    return json({
      error: policy.errors[0],
      trackingLink: `/portal/${shopDomain}/tracking/${policy.existingRequestId}`,
    });
  }

  // Show all other policy errors
  if (!policy.eligible) {
    return json({ error: policy.errors.join(" ") });
  }

  // Collect already-returned item IDs
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
    return redirect(`/portal/${shopDomain}/tracking/${existingReturns[0].reqId}`);
  }

  // Pass order data + policy info to next step
  const orderData = encodeURIComponent(
    JSON.stringify({
      id: String(order.id),
      name: order.name,
      order_number: order.order_number,
      tags: order.tags || "",
      shipping_address: order.shipping_address,
      customer: order.customer,
      financial_status: order.financial_status,
      currency,
      days_since: daysSince,
      is_cod: (order.financial_status || "").toLowerCase().includes("pending"),
      returned_item_ids: returnedItemIds,
      exchange_allowed: policy.exchangeAllowed,
      exchange_other_products: policy.exchangeOtherProducts,
      multiple_returns_mode: policy.multipleReturnsMode,
      existing_request_id: policy.existingRequestId,
      fees: policy.fees,
      blocked_return_tags: policy.blockedReturnTags,
      blocked_exchange_tags: policy.blockedExchangeTags,
      line_items: (order.line_items || []).map((li: any) => ({
        id: String(li.id),
        title: li.title,
        variant_title: li.variant_title,
        variant_id: li.variant_id,
        product_id: li.product_id,
        price: li.price,
        quantity: li.quantity,
        image_url: li.image?.src || null,
        product_tags: li.product_tags || "",
      })),
    }),
  );

  return redirect(`/portal/${shopDomain}/request?order=${orderData}`);
};

export default function PortalLookup() {
  const { enableOtp } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const { shop } = useParams();
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  // OTP verified — show order selection
  if (actionData?.otpVerified && actionData?.orders) {
    return (
      <>
        <div className="portal-breadcrumbs">
          <span className="portal-breadcrumb active">Find Order</span>
          <span className="portal-breadcrumb-sep">›</span>
          <span className="portal-breadcrumb">Select Items</span>
          <span className="portal-breadcrumb-sep">›</span>
          <span className="portal-breadcrumb">Confirm</span>
        </div>
        <div className="portal-card">
          <h2>Select an Order</h2>
          <p style={{ color: "var(--portal-text-muted)", marginBottom: 20, fontSize: 14 }}>
            We found {actionData.orders.length} order(s) for {actionData.otpEmail}. Select one to continue.
          </p>
          {actionData.orders.map((order: any) => (
            <a
              key={order.id}
              href={`/portal/${shop}?orderNumber=${order.order_number}`}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: 8,
                marginBottom: 8, textDecoration: "none", color: "inherit",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{order.name}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {new Date(order.created_at).toLocaleDateString()} · {order.item_count} item(s)
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600 }}>${order.total_price}</div>
                <div style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>{order.financial_status}</div>
              </div>
            </a>
          ))}
        </div>
      </>
    );
  }

  // OTP sent — show OTP input
  if (actionData?.otpSent) {
    return (
      <>
        <div className="portal-breadcrumbs">
          <span className="portal-breadcrumb active">Find Order</span>
          <span className="portal-breadcrumb-sep">›</span>
          <span className="portal-breadcrumb">Select Items</span>
          <span className="portal-breadcrumb-sep">›</span>
          <span className="portal-breadcrumb">Confirm</span>
        </div>
        <div className="portal-card">
          <h2>Enter OTP</h2>
          <p style={{ color: "var(--portal-text-muted)", marginBottom: 20, fontSize: 14 }}>
            We sent a 6-digit OTP to <strong>{actionData.otpEmail}</strong>. Enter it below.
          </p>
          {actionData?.error && <div className="portal-error">{actionData.error}</div>}
          <Form method="post">
            <input type="hidden" name="intent" value="verify_otp" />
            <input type="hidden" name="email" value={actionData.otpEmail} />
            <div className="portal-field">
              <label className="portal-label">OTP Code</label>
              <input className="portal-input" name="otp" type="text" placeholder="000000" maxLength={6} pattern="[0-9]{6}" required
                style={{ letterSpacing: 8, fontSize: 20, textAlign: "center" }} />
            </div>
            <button className="portal-btn portal-btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? "Verifying..." : "Verify OTP"}
            </button>
          </Form>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <Form method="post" style={{ display: "inline" }}>
              <input type="hidden" name="intent" value="send_otp" />
              <input type="hidden" name="email" value={actionData.otpEmail} />
              <button type="submit" disabled={isLoading}
                style={{ background: "none", border: "none", color: "var(--portal-accent)", fontSize: 13, cursor: "pointer" }}>
                Resend OTP
              </button>
            </Form>
          </div>
        </div>
      </>
    );
  }

  // Default — show lookup form (OTP mode or pincode mode)
  return (
    <>
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
          {enableOtp
            ? "Enter your email address to verify your identity and start a return or exchange."
            : "Enter your order number and shipping pincode to start a return or exchange."}
        </p>

        {actionData?.error && (
          <div className="portal-error">
            {actionData.error}
            {actionData.trackingLink && (
              <div style={{ marginTop: 8 }}>
                <Link to={actionData.trackingLink} style={{ color: "var(--portal-accent)", fontWeight: 600 }}>
                  View existing request →
                </Link>
              </div>
            )}
          </div>
        )}

        {enableOtp ? (
          <Form method="post">
            <input type="hidden" name="intent" value="send_otp" />
            <div className="portal-field">
              <label className="portal-label">Email Address</label>
              <input className="portal-input" name="email" type="email" placeholder="your@email.com" required />
            </div>
            <button className="portal-btn portal-btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? "Sending OTP..." : "Send OTP"}
            </button>
          </Form>
        ) : (
          <Form method="post">
            <div className="portal-field">
              <label className="portal-label">Order Number</label>
              <input className="portal-input" name="orderNumber" type="text" placeholder="e.g. 1001" required />
            </div>
            <div className="portal-field">
              <label className="portal-label">Shipping Pincode</label>
              <input className="portal-input" name="pincode" type="text" placeholder="e.g. 400001" maxLength={6} pattern="[0-9]{6}" required />
            </div>
            <button className="portal-btn portal-btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? "Looking up..." : "Find My Order"}
            </button>
          </Form>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link to={`/portal/${shop}/tracking`}
          style={{ color: "var(--portal-accent)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
          Already submitted a return? Track your requests →
        </Link>
      </div>
    </>
  );
}
