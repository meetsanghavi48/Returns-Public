import prisma from "~/db.server";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { decrypt } from "~/utils/encryption.server";

export async function refreshTrackingForReturn(returnId: string) {
  const returnReq = await prisma.returnRequest.findUnique({
    where: { id: returnId },
  });
  if (!returnReq || !returnReq.awb) return null;

  const config = await prisma.logisticsConfig.findFirst({
    where: { shop: returnReq.shop, isDefault: true, isActive: true },
  });
  if (!config) return null;

  const adapter = logisticsRegistry.getAdapter(config.providerKey);
  if (!adapter) return null;

  const credentials = JSON.parse(decrypt(config.credentials));
  const result = await adapter.trackShipment(returnReq.awb, credentials);

  if (result.success) {
    const statusChanged = returnReq.awbStatus !== result.currentStatus;

    await prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        awbStatus: result.currentStatus,
        awbStatusCode: result.currentStatusCode,
        awbLastChecked: new Date(),
        awbFinal: result.isDelivered,
        ...(result.isDelivered && returnReq.status !== "delivered" ? { status: "delivered" } : {}),
      },
    });

    if (statusChanged) {
      await prisma.returnEvent.create({
        data: {
          shop: returnReq.shop,
          returnId,
          type: "tracking_update",
          status: result.currentStatus,
          message: `Shipment status: ${result.currentStatus}`,
          actor: "system",
          metadata: { events: result.events.slice(0, 5) } as any,
        },
      });
    }

    return { ...result, statusChanged };
  }

  return result;
}

export async function bulkRefreshTracking() {
  const activeReturns = await prisma.returnRequest.findMany({
    where: {
      status: { in: ["pickup_scheduled", "in_transit"] },
      awb: { not: null },
      awbFinal: false,
    },
    take: 100,
  });

  const results = {
    processed: 0,
    updated: 0,
    errors: [] as Array<{ returnId: string; error: string }>,
  };

  for (const ret of activeReturns) {
    results.processed++;
    try {
      const result = await refreshTrackingForReturn(ret.id);
      if (result && "statusChanged" in result && result.statusChanged) {
        results.updated++;
      }
    } catch (error) {
      results.errors.push({
        returnId: ret.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
