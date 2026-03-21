import prisma from "../db.server";
import { shopifyREST, updateOrderTags, uid } from "./shopify.server";
import { auditLog } from "./audit.server";
import { getSetting } from "./settings.server";

// Process a refund for a return request
export async function processRefund(
  shop: string,
  accessToken: string,
  request: any,
) {
  try {
    const returnItems = (request.items || []).filter(
      (i: any) => i.action === "return",
    );
    if (!returnItems.length) return null;

    const fo = await shopifyREST(
      shop,
      accessToken,
      "GET",
      `orders/${request.orderId}.json?fields=line_items,financial_status`,
    );
    const lines = fo?.order?.line_items || [];
    if (!lines.length) return null;

    const returnIds = returnItems
      .map((i: any) => String(i.id))
      .filter(Boolean);
    const useLines = returnIds.length
      ? lines.filter((li: any) => returnIds.includes(String(li.id)))
      : lines;

    // Fetch primary location for restocking
    let locationId: number | null = null;
    try {
      const locs = await shopifyREST(
        shop,
        accessToken,
        "GET",
        "locations.json?active=true&limit=1",
      );
      locationId = locs?.locations?.[0]?.id || null;
    } catch {}

    // Build refund line items with correct quantities
    const rli = useLines.map((li: any) => {
      const reqItem = returnItems.find(
        (i: any) => String(i.id) === String(li.id),
      );
      const qty = Math.min(
        parseInt(reqItem?.qty) || li.quantity,
        li.quantity,
      );
      const item: any = {
        line_item_id: li.id,
        quantity: qty,
        restock_type: locationId ? "return" : "no_restock",
      };
      if (locationId) item.location_id = locationId;
      return item;
    });

    // Calculate refund
    const calc = await shopifyREST(
      shop,
      accessToken,
      "POST",
      `orders/${request.orderId}/refunds/calculate.json`,
      { refund: { refund_line_items: rli } },
    );
    if (calc.errors) {
      console.error("[Refund calc]", calc.errors);
      return null;
    }

    let txns = calc?.refund?.transactions || [];
    const restockingFee = await getSetting<number>(
      shop,
      "restocking_fee_pct",
      0,
    );
    const shippingFee = await getSetting<number>(
      shop,
      "return_shipping_fee",
      100,
    );

    if (restockingFee > 0) {
      txns = txns.map((t: any) => ({
        ...t,
        amount: (parseFloat(t.amount || 0) * (1 - restockingFee / 100)).toFixed(
          2,
        ),
      }));
    }
    // Deduct return shipping fee for original payment
    if (shippingFee > 0) {
      txns = txns.map((t: any) => ({
        ...t,
        amount: Math.max(0, parseFloat(t.amount || 0) - shippingFee).toFixed(2),
      }));
    }

    // STORE CREDIT PATH
    if (request.refundMethod === "store_credit") {
      const base = parseFloat(
        txns[0]?.amount ||
          returnItems.reduce(
            (s: number, i: any) =>
              s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
            0,
          ),
      );
      const total = base.toFixed(2);
      const code = `CREDIT-${String(request.orderId).slice(-6)}-${uid().toUpperCase().slice(0, 6)}`;

      // Get customer ID
      let customerId = null;
      try {
        const cd = await shopifyREST(
          shop,
          accessToken,
          "GET",
          `orders/${request.orderId}.json?fields=customer`,
        );
        customerId = cd?.order?.customer?.id || null;
      } catch {}

      // Create gift card
      let gcr = null;
      try {
        const gcp: any = {
          gift_card: {
            initial_value: total,
            code,
            note: `Store credit — ${request.reqId}`,
          },
        };
        if (customerId) gcp.gift_card.customer_id = customerId;
        gcr = await shopifyREST(
          shop,
          accessToken,
          "POST",
          "gift_cards.json",
          gcp,
        );
      } catch (e: any) {
        console.error("[GiftCard]", e.message);
      }

      if (!gcr?.gift_card?.id) {
        // Fallback: save code to order note
        const en = (
          await shopifyREST(
            shop,
            accessToken,
            "GET",
            `orders/${request.orderId}.json?fields=note`,
          )
        )?.order?.note || "";
        await shopifyREST(
          shop,
          accessToken,
          "PUT",
          `orders/${request.orderId}.json`,
          {
            order: {
              id: request.orderId,
              note: (
                en +
                `\n[STORE CREDIT] Code:${code} ₹${total} REQ:${request.reqId} ${new Date().toISOString()}`
              ).slice(0, 5000),
            },
          },
        );
      }

      // Restock inventory (no payment reversal)
      try {
        await shopifyREST(
          shop,
          accessToken,
          "POST",
          `orders/${request.orderId}/refunds.json`,
          {
            refund: {
              notify: true,
              note: `Store credit issued — ${request.reqId}`,
              refund_line_items: rli,
              transactions: [],
            },
          },
        );
      } catch (e: any) {
        console.error("[Refund restock]", e.message);
      }

      await updateOrderTags(shop, accessToken, request.orderId, [
        "store-credit-issued",
        "return-refunded",
      ]);
      await prisma.returnRequest.update({
        where: { reqId: request.reqId },
        data: { refundAmount: parseFloat(total), status: "refunded" },
      });
      await auditLog(
        shop,
        request.orderId,
        request.reqId,
        "store_credit_auto",
        "system",
        `${code} ₹${total}`,
      );
      return { code, amount: total, method: "store_credit" };
    }

    // ORIGINAL PAYMENT PATH
    const refundPayload = {
      refund: {
        notify: true,
        note: `Return delivered to warehouse — ${request.reqId}`,
        refund_line_items: rli,
        transactions: txns.map((t: any) => ({
          parent_id: t.parent_id,
          amount: t.amount,
          kind: "refund",
          gateway: t.gateway,
        })),
      },
    };

    const result = await shopifyREST(
      shop,
      accessToken,
      "POST",
      `orders/${request.orderId}/refunds.json`,
      refundPayload,
    );

    if (result?.refund?.id) {
      const amount =
        result.refund.transactions?.[0]?.amount || txns[0]?.amount || "0";
      await prisma.returnRequest.update({
        where: { reqId: request.reqId },
        data: {
          refundId: String(result.refund.id),
          refundAmount: parseFloat(amount),
          status: "refunded",
        },
      });
      await updateOrderTags(shop, accessToken, request.orderId, [
        "return-refunded",
      ]);
      await auditLog(
        shop,
        request.orderId,
        request.reqId,
        "refunded_original",
        "system",
        `₹${amount} to original payment`,
      );
      return { refund_id: result.refund.id, amount, method: "original" };
    }

    console.error(
      "[Refund] Failed:",
      JSON.stringify(result?.errors || result).slice(0, 200),
    );
    return null;
  } catch (e: any) {
    console.error("[processRefund]", e.message);
    return null;
  }
}
