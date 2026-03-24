import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation, useNavigate } from "@remix-run/react";
import { useState, useMemo } from "react";
import prisma from "../db.server";
import { submitReturnRequest } from "../services/returns.server";

// Fee calculation — pure function, no server imports
function calculateFees(
  items: Array<{ price: string | number; qty: number; action: string }>,
  fees: { restockingFee: number; returnShippingFee: number; exchangeShippingFee: number; taxRate: number },
) {
  const returnItems = items.filter((i) => i.action === "return");
  const exchangeItems = items.filter((i) => i.action === "exchange");
  const returnTotal = returnItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );
  const exchangeTotal = exchangeItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );
  const itemTotal = returnTotal + exchangeTotal;
  const restockingFee = fees.restockingFee > 0
    ? Math.round(returnTotal * (fees.restockingFee / 100) * 100) / 100 : 0;
  const shippingFee = (returnItems.length > 0 ? fees.returnShippingFee : 0)
    + (exchangeItems.length > 0 ? fees.exchangeShippingFee : 0);
  const refundAmount = Math.max(0, returnTotal - restockingFee - shippingFee);
  return { itemTotal, restockingFee, shippingFee, refundAmount };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const dataParam = url.searchParams.get("data");
  if (!dataParam) throw redirect(`/portal/${params.shop}`);

  try {
    const data = JSON.parse(decodeURIComponent(dataParam));
    return json({ data, shop: params.shop });
  } catch {
    throw redirect(`/portal/${params.shop}`);
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const shopDomain = params.shop!;
  const formData = await request.formData();
  const orderDataStr = formData.get("orderData") as string;
  const refundMethod = formData.get("refundMethod") as string;

  let orderData;
  try {
    orderData = JSON.parse(orderDataStr);
  } catch {
    return json({ error: "Invalid data" });
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) return json({ error: "Store not found" });

  try {
    const reqId = await submitReturnRequest(shopDomain, shopRecord.accessToken, {
      orderId: orderData.id,
      orderNumber: String(orderData.order_number || orderData.name?.replace("#", "")),
      customerName: orderData.customer
        ? `${orderData.customer.first_name || ""} ${orderData.customer.last_name || ""}`.trim()
        : orderData.shipping_address?.name || "",
      customerEmail: orderData.customer?.email || orderData.email || "",
      items: orderData.selected_items,
      refundMethod,
      shippingPreference: "pickup",
      address: orderData.shipping_address,
      isCod: orderData.is_cod || false,
      daysSinceOrder: orderData.days_since || 0,
      orderTags: orderData.tags || "",
      orderLineItems: orderData.line_items || [],
      multipleReturnsMode: orderData.multiple_returns_mode || "new",
      existingRequestId: orderData.existing_request_id,
    });

    return redirect(`/portal/${shopDomain}/tracking/${reqId}`);
  } catch (e: any) {
    return json({ error: e.message || "Failed to submit return request" });
  }
};

export default function PortalConfirm() {
  const { data, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const nav = useNavigate();
  const [refundMethod, setRefundMethod] = useState("original");

  const selectedItems = data.selected_items || [];
  const totalAmount = selectedItems.reduce(
    (s: number, i: any) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );
  const address = data.shipping_address || {};

  // Determine request type
  const hasReturn = selectedItems.some((i: any) => i.action === "return");
  const hasExchange = selectedItems.some((i: any) => i.action === "exchange");
  const isExchangeOnly = hasExchange && !hasReturn;

  // Currency symbol from store
  const currencyCode = data.currency || "INR";
  const currencySymbol: Record<string, string> = {
    INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", JPY: "¥", SGD: "S$", AED: "AED ",
  };
  const cs = currencySymbol[currencyCode] || currencyCode + " ";

  // Calculate fees from policy settings
  const fees = data.fees || { restockingFee: 0, returnShippingFee: 0, exchangeShippingFee: 0, taxRate: 0 };
  const feeBreakdown = useMemo(
    () => calculateFees(selectedItems, fees),
    [selectedItems, fees],
  );
  const hasFees = feeBreakdown.restockingFee > 0 || feeBreakdown.shippingFee > 0;

  return (
    <>
      {/* Breadcrumb navigation */}
      <div className="portal-breadcrumbs">
        <span className="portal-breadcrumb done" onClick={() => nav(`/portal/${shop}`)}>
          Find Order
        </span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb done" onClick={() => nav(-hasExchange ? 2 : 1)}>
          Select Items
        </span>
        {hasExchange && (
          <>
            <span className="portal-breadcrumb-sep">›</span>
            <span className="portal-breadcrumb done" onClick={() => nav(-1)}>
              Exchange
            </span>
          </>
        )}
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb active">Confirm</span>
      </div>

      <div className="portal-card">
        <h2>Review & Confirm</h2>

        {actionData?.error && (
          <div className="portal-error">{actionData.error}</div>
        )}

        {/* Items summary */}
        <h3 style={{ marginTop: 8 }}>Items</h3>
        {selectedItems.map((item: any, idx: number) => (
          <div className="portal-item" key={idx}>
            {item.image_url && (
              <img className="portal-item-image" src={item.image_url} alt={item.title} />
            )}
            <div className="portal-item-info">
              <div className="portal-item-title">{item.title}</div>
              <div className="portal-item-meta">
                {item.variant_title || ""} &middot; Qty: {item.qty || 1} &middot;{" "}
                <span style={{ textTransform: "capitalize" }}>{item.action}</span>
              </div>
              {item.exchange_variant_title && (
                <div className="portal-item-meta">
                  Exchange to: {item.exchange_variant_title}
                </div>
              )}
              {item.reason && (
                <div className="portal-item-meta">Reason: {item.reason}</div>
              )}
            </div>
            <div className="portal-item-price">{cs}{item.price}</div>
          </div>
        ))}

        {/* Fee breakdown */}
        {hasReturn && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--portal-border)", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span>Item total</span>
              <span>{cs}{feeBreakdown.itemTotal.toLocaleString("en-IN")}</span>
            </div>
            {feeBreakdown.restockingFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4, color: "var(--portal-accent)" }}>
                <span>Restocking fee ({fees.restockingFee}%)</span>
                <span>- {cs}{feeBreakdown.restockingFee.toLocaleString("en-IN")}</span>
              </div>
            )}
            {feeBreakdown.shippingFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4, color: "var(--portal-accent)" }}>
                <span>Shipping fee</span>
                <span>- {cs}{feeBreakdown.shippingFee.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, marginTop: 8, borderTop: "1px solid var(--portal-border)", paddingTop: 8 }}>
              <span>Refund amount</span>
              <span>{cs}{feeBreakdown.refundAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}
        {!hasReturn && (
          <div style={{ textAlign: "right", fontWeight: 700, margin: "12px 0", fontSize: 16 }}>
            Total: {cs}{totalAmount.toLocaleString("en-IN")}
          </div>
        )}
      </div>

      {/* Refund Method - only show when there are return items */}
      {!isExchangeOnly && (
        <div className="portal-card">
          <h3>Refund Method</h3>
          <div className="portal-toggle-group" style={{ marginTop: 8 }}>
            <button
              className={`portal-toggle ${refundMethod === "original" ? "active" : ""}`}
              onClick={() => setRefundMethod("original")}
              type="button"
            >
              Original Payment
            </button>
            <button
              className={`portal-toggle ${refundMethod === "store_credit" ? "active" : ""}`}
              onClick={() => setRefundMethod("store_credit")}
              type="button"
            >
              Store Credit
            </button>
          </div>
          <p style={{ fontSize: 13, color: "var(--portal-text-muted)", marginTop: 8 }}>
            {refundMethod === "original"
              ? "Refund will be processed to your original payment method. A shipping fee may be deducted."
              : "Receive store credit for the full amount. Can be used on future purchases."}
          </p>
        </div>
      )}

      {/* Exchange info */}
      {hasExchange && (
        <div className="portal-card">
          <h3>Exchange Details</h3>
          {selectedItems
            .filter((i: any) => i.action === "exchange")
            .map((item: any, idx: number) => (
              <div key={idx} style={{ marginTop: idx > 0 ? 12 : 4 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</p>
                <p style={{ fontSize: 13, color: "var(--portal-text-muted)" }}>
                  Current: {item.variant_title || "Default"} → Replacement:{" "}
                  {item.exchange_variant_title || "Same variant"}
                </p>
              </div>
            ))}
          <p style={{ fontSize: 13, color: "var(--portal-text-muted)", marginTop: 12 }}>
            Your exchange order will be created once the original items are picked up.
          </p>
        </div>
      )}

      {/* Pickup Address */}
      <div className="portal-card">
        <h3>Pickup Address</h3>
        <p style={{ fontSize: 14, marginTop: 4 }}>
          {address.name && <>{address.name}<br /></>}
          {address.address1 && <>{address.address1}<br /></>}
          {address.address2 && <>{address.address2}<br /></>}
          {address.city && <>{address.city}, </>}
          {address.province && <>{address.province} </>}
          {address.zip && <>{address.zip}<br /></>}
          {address.phone && <>Phone: {address.phone}</>}
        </p>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          className="portal-btn"
          onClick={() => nav(-1)}
          type="button"
          style={{ flex: 1 }}
        >
          ← Back
        </button>
        <Form method="post" style={{ flex: 2 }}>
          <input type="hidden" name="orderData" value={JSON.stringify(data)} />
          <input type="hidden" name="refundMethod" value={refundMethod} />
          <button
            className="portal-btn portal-btn-primary"
            type="submit"
            disabled={isLoading}
            style={{ width: "100%" }}
          >
            {isLoading ? "Submitting..." : "Submit Return Request"}
          </button>
        </Form>
      </div>
    </>
  );
}
