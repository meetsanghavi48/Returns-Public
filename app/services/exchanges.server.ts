import prisma from "../db.server";
import { shopifyREST, updateOrderTags } from "./shopify.server";
import { auditLog } from "./audit.server";

// Get next exchange number for a shop (atomic increment)
async function getNextExcNumber(shop: string): Promise<number> {
  const result = await prisma.exchangeCounter.update({
    where: { shop },
    data: { lastNumber: { increment: 1 } },
  });
  return result.lastNumber;
}

// Create an exchange order on Shopify
export async function createExchangeOrder(
  shop: string,
  accessToken: string,
  request: any,
) {
  try {
    const exchItems = (request.items || []).filter(
      (i: any) => i.action === "exchange" && i.exchange_variant_id,
    );
    if (!exchItems.length) {
      console.log(`[Exchange] No exchange items for ${request.reqId}`);
      return null;
    }

    const excNum = await getNextExcNumber(shop);
    const excTag = `EXC${excNum}`;

    const orig = await shopifyREST(
      shop,
      accessToken,
      "GET",
      `orders/${request.orderId}.json?fields=email,shipping_address,billing_address,customer`,
    );
    const o = orig?.order;

    const draft = await shopifyREST(
      shop,
      accessToken,
      "POST",
      "draft_orders.json",
      {
        draft_order: {
          line_items: exchItems.map((i: any) => ({
            variant_id: parseInt(i.exchange_variant_id),
            quantity: parseInt(i.qty) || 1,
            applied_discount: {
              description: "Exchange",
              value_type: "percentage",
              value: "100",
              amount: String(i.price || "0"),
              title: "Exchange",
            },
          })),
          customer: o?.customer ? { id: o.customer.id } : undefined,
          shipping_address: request.address || o?.shipping_address,
          billing_address:
            o?.billing_address || request.address || o?.shipping_address,
          email: o?.email,
          note: `${excTag} — Exchange for #${request.orderNumber} | Original: ${request.reqId}`,
          tags: `exchange-order,${excTag}`,
          send_invoice: false,
        },
      },
    );

    if (!draft?.draft_order?.id) {
      console.error(
        "[Exchange] Draft failed:",
        JSON.stringify(draft?.errors || draft).slice(0, 200),
      );
      return null;
    }

    const done = await shopifyREST(
      shop,
      accessToken,
      "PUT",
      `draft_orders/${draft.draft_order.id}/complete.json`,
    );
    const newOid = String(done?.draft_order?.order_id || "");
    const newName = done?.draft_order?.name || `#${excTag}`;

    await prisma.returnRequest.update({
      where: { reqId: request.reqId },
      data: {
        exchangeOrderId: newOid,
        exchangeOrderName: excTag,
        exchangeOrderNumber: excTag,
        exchangeShopifyName: newName,
        status: "exchange_fulfilled",
      },
    });

    await updateOrderTags(shop, accessToken, request.orderId, [
      "exchange-fulfilled",
      excTag,
    ]);
    await auditLog(
      shop,
      request.orderId,
      request.reqId,
      "exchange_created",
      "system",
      `${excTag} (Shopify:${newName}) orderId:${newOid}`,
    );
    console.log(
      `[Exchange] Created ${excTag} (${newName}) for ${request.reqId}`,
    );
    return {
      order_id: newOid,
      order_name: excTag,
      shopify_name: newName,
      exc_tag: excTag,
    };
  } catch (e: any) {
    console.error("[createExchange]", e.message);
    return null;
  }
}
