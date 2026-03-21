import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { delhiveryAPI } from "../services/delhivery.server";
import { processRefund } from "../services/refunds.server";
import { createExchangeOrder } from "../services/exchanges.server";
import { archiveRequest } from "../services/returns.server";
import { auditLog } from "../services/audit.server";

// Cron endpoint: poll Delhivery tracking for all active AWBs
// Triggered externally every 2 hours
export const loader = async ({ request }: ActionFunctionArgs) => {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let updated = 0;
  let delivered = 0;
  let errors = 0;

  // Get all shops with Delhivery configured
  const shops = await prisma.shop.findMany({
    where: { uninstalledAt: null, delhiveryToken: { not: null } },
  });

  for (const shop of shops) {
    // Find requests with active AWBs
    const activeTracking = await prisma.returnRequest.findMany({
      where: {
        shop: shop.shop,
        awb: { not: null },
        awbFinal: false,
        status: { in: ["pickup_scheduled", "in_transit"] },
      },
      take: 50,
    });

    for (const req of activeTracking) {
      try {
        const trackData = await delhiveryAPI(
          shop.delhiveryToken!,
          "GET",
          `/api/v1/packages/json/?waybill=${req.awb}`,
        );

        const pkg = trackData?.ShipmentData?.[0]?.Shipment;
        if (!pkg) continue;

        const statusCode = pkg.Status?.StatusCode || "";
        const statusStr = pkg.Status?.Status || "";
        const lastScan = pkg.Scans?.[pkg.Scans.length - 1] || null;

        // Determine if delivered
        const isDelivered = ["DL", "RT-DL"].includes(statusCode) ||
          statusStr.toLowerCase().includes("delivered");

        const updateData: any = {
          awbStatus: statusStr,
          awbStatusCode: statusCode,
          awbLastScan: lastScan as any,
          awbLastChecked: new Date(),
        };

        if (isDelivered) {
          updateData.awbFinal = true;
          updateData.status = "delivered";
          delivered++;

          // Auto-process based on request type
          if (req.requestType === "return" || req.requestType === "mixed") {
            // Auto-refund
            const updatedReq = { ...req, ...updateData };
            try {
              await processRefund(shop.shop, shop.accessToken, updatedReq);
            } catch (e: any) {
              console.error(`[Tracking] Auto-refund failed for ${req.reqId}:`, e.message);
            }
          }
          if (req.requestType === "exchange" || req.requestType === "mixed") {
            // Auto-create exchange
            try {
              await createExchangeOrder(shop.shop, shop.accessToken, req);
            } catch (e: any) {
              console.error(`[Tracking] Auto-exchange failed for ${req.reqId}:`, e.message);
            }
          }

          // Auto-archive after processing
          try {
            await archiveRequest(shop.shop, req.reqId);
          } catch {}

          await auditLog(
            shop.shop,
            req.orderId,
            req.reqId,
            "tracking_delivered",
            "system",
            `AWB:${req.awb} delivered`,
          );
        } else if (["PP", "OP", "IT", "OT"].includes(statusCode)) {
          // In transit statuses
          updateData.status = "in_transit";
        }

        await prisma.returnRequest.update({
          where: { reqId: req.reqId },
          data: updateData,
        });
        updated++;
      } catch (e: any) {
        console.error(`[Tracking] ${req.reqId}:`, e.message);
        errors++;
      }
    }
  }

  return json({ ok: true, updated, delivered, errors });
};
