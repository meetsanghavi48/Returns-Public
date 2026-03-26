import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { createDelhiveryPickup } from "../services/delhivery.server";

function verifyCronAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Support both Bearer header and query string (prefer header)
  const authHeader = request.headers.get("Authorization");
  if (authHeader) return authHeader === `Bearer ${expected}`;
  return new URL(request.url).searchParams.get("secret") === expected;
}

// Cron endpoint: create Delhivery pickups for approved requests
// Triggered externally (e.g., cron-job.org) every 5 minutes
export const loader = async ({ request }: ActionFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  let processed = 0;
  let errors = 0;

  // Get all active shops
  const shops = await prisma.shop.findMany({
    where: { uninstalledAt: null },
  });

  for (const shop of shops) {
    // Find approved requests with no AWB, approved 2+ hours ago
    const pendingPickups = await prisma.returnRequest.findMany({
      where: {
        shop: shop.shop,
        status: "approved",
        awb: null,
        approvedAt: { lt: twoHoursAgo },
      },
      take: 10,
    });

    for (const req of pendingPickups) {
      try {
        if (!shop.delhiveryToken) continue; // Skip shops without Delhivery configured
        await createDelhiveryPickup(shop.shop, shop.accessToken, req);
        processed++;
      } catch (e: any) {
        console.error(`[Cron/Pickup] ${req.reqId}:`, e.message);
        errors++;
      }
    }
  }

  return json({ ok: true, processed, errors });
};
