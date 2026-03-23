import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { submitReturnRequest } from "../services/returns.server";

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
  const [refundMethod, setRefundMethod] = useState("original");

  const selectedItems = data.selected_items || [];
  const totalAmount = selectedItems.reduce(
    (s: number, i: any) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );
  const address = data.shipping_address || {};

  return (
    <>
      <div className="portal-steps">
        <div className="portal-step done" />
        <div className="portal-step done" />
        <div className="portal-step active" />
        <div className="portal-step" />
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
              {item.reason && (
                <div className="portal-item-meta">Reason: {item.reason}</div>
              )}
            </div>
            <div className="portal-item-price">₹{item.price}</div>
          </div>
        ))}

        <div style={{ textAlign: "right", fontWeight: 700, margin: "12px 0", fontSize: 16 }}>
          Total: ₹{totalAmount.toLocaleString("en-IN")}
        </div>
      </div>

      {/* Refund Method */}
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

      {/* Submit */}
      <Form method="post">
        <input type="hidden" name="orderData" value={JSON.stringify(data)} />
        <input type="hidden" name="refundMethod" value={refundMethod} />
        <button
          className="portal-btn portal-btn-primary"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? "Submitting..." : "Submit Return Request"}
        </button>
      </Form>
    </>
  );
}
