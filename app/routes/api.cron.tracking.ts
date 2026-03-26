import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { bulkRefreshTracking } from "../services/tracking.server";
import { processRefund } from "../services/refunds.server";
import { createExchangeOrder } from "../services/exchanges.server";
import { archiveRequest } from "../services/returns.server";
import { auditLog } from "../services/audit.server";
import { sendNotification } from "../services/email-templates.server";

function verifyCronAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = request.headers.get("Authorization");
  if (authHeader) return authHeader === `Bearer ${expected}`;
  return new URL(request.url).searchParams.get("secret") === expected;
}

// Cron endpoint: poll tracking for all active AWBs via adapter registry
// Triggered externally every 2 hours
export const loader = async ({ request }: ActionFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the adapter-based bulk refresh (supports ALL logistics providers)
  const trackingResults = await bulkRefreshTracking();

  let delivered = 0;
  let autoProcessed = 0;

  // Post-process delivered returns: auto-refund, auto-exchange, auto-archive
  const deliveredReturns = await prisma.returnRequest.findMany({
    where: {
      status: "delivered",
      awbFinal: true,
      autoAction: null, // Not yet auto-processed
    },
    take: 50,
  });

  for (const req of deliveredReturns) {
    const shopRecord = await prisma.shop.findUnique({ where: { shop: req.shop } });
    if (!shopRecord) continue;

    delivered++;
    try {
      // Auto-refund for return requests
      if (req.requestType === "return" || req.requestType === "mixed") {
        try {
          await processRefund(req.shop, shopRecord.accessToken, req);
        } catch (e: any) {
          console.error(`[Tracking] Auto-refund failed for ${req.reqId}:`, e.message);
        }
      }

      // Auto-create exchange order
      if (req.requestType === "exchange" || req.requestType === "mixed") {
        try {
          await createExchangeOrder(req.shop, shopRecord.accessToken, req);
        } catch (e: any) {
          console.error(`[Tracking] Auto-exchange failed for ${req.reqId}:`, e.message);
        }
      }

      // Send delivery notification
      sendNotification(req.shop, "return_received", req.reqId, {
        customer_name: req.customerName || "Customer",
        customer_email: req.customerEmail || "",
        order_number: req.orderNumber || req.orderId,
        request_id: req.reqId,
        refund_method: req.refundMethod || "pending",
        refund_amount: String(req.refundAmount || "pending"),
        awb_number: req.awb || "",
      }).catch(() => {});

      // Mark as auto-processed and archive
      await prisma.returnRequest.update({
        where: { reqId: req.reqId },
        data: { autoAction: "cron_processed" },
      });

      try {
        await archiveRequest(req.shop, req.reqId);
      } catch (e: any) {
        console.error(`[Tracking] Auto-archive failed for ${req.reqId}:`, e.message);
      }

      await auditLog(req.shop, req.orderId, req.reqId, "tracking_delivered", "system", `AWB:${req.awb} delivered & auto-processed`);
      autoProcessed++;
    } catch (e: any) {
      console.error(`[Tracking] Post-delivery processing failed for ${req.reqId}:`, e.message);
    }
  }

  return json({
    ok: true,
    tracking: trackingResults,
    delivered,
    autoProcessed,
  });
};
