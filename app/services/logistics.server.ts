import prisma from "~/db.server";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { decrypt } from "~/utils/encryption.server";
import type { PickupParams, PickupResult, TrackingResult } from "~/adapters/logistics/base";

export async function getLogisticsConfigsForShop(shop: string) {
  return prisma.logisticsConfig.findMany({
    where: { shop, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getDefaultLogisticsForShop(shop: string) {
  const config = await prisma.logisticsConfig.findFirst({
    where: { shop, isDefault: true, isActive: true },
  });
  if (!config) return null;

  const adapter = logisticsRegistry.getAdapter(config.providerKey);
  if (!adapter) return null;

  const credentials = JSON.parse(decrypt(config.credentials));
  return { adapter, credentials, config };
}

export async function createPickupForReturn(returnId: string, shop: string): Promise<PickupResult> {
  const logistics = await getDefaultLogisticsForShop(shop);
  if (!logistics) {
    return { success: false, error: "No logistics provider configured" };
  }

  const returnReq = await prisma.returnRequest.findFirst({
    where: { id: returnId, shop },
  });
  if (!returnReq) {
    return { success: false, error: "Return request not found" };
  }

  // Get shop warehouse details
  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  if (!shopRecord) {
    return { success: false, error: "Shop not found" };
  }

  const address = returnReq.address as Record<string, string> | null;
  const items = (returnReq.items as Array<Record<string, unknown>>) || [];

  const params: PickupParams = {
    returnId,
    senderName: address?.name || returnReq.customerName || "Customer",
    senderPhone: address?.phone || "",
    senderAddress: address?.address1 || "",
    senderCity: address?.city || "",
    senderState: address?.state || "",
    senderPincode: address?.zip || "",
    senderCountry: address?.country || "India",
    receiverName: shopRecord.warehouseName || "Warehouse",
    receiverPhone: shopRecord.warehousePhone || "",
    receiverAddress: shopRecord.warehouseAddress || "",
    receiverCity: shopRecord.warehouseCity || "",
    receiverState: shopRecord.warehouseState || "",
    receiverPincode: shopRecord.warehousePincode || "",
    receiverCountry: "India",
    weight: 500,
    items: items.map((item) => ({
      name: String(item.title || ""),
      sku: String(item.sku || ""),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
    })),
    orderNumber: returnReq.orderNumber || returnReq.orderId,
    paymentMode: returnReq.isCod ? "cod" : "prepaid",
  };

  const result = await logistics.adapter.createPickup(params, logistics.credentials);

  if (result.success && result.awb) {
    await prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        awb: result.awb,
        awbStatus: "pickup_scheduled",
        status: "pickup_scheduled",
        pickupCreatedAt: new Date(),
      },
    });

    // Create return event
    await prisma.returnEvent.create({
      data: {
        shop,
        returnId,
        type: "pickup_scheduled",
        status: "pickup_scheduled",
        message: `Pickup scheduled via ${logistics.config.displayName}. AWB: ${result.awb}`,
        actor: "system",
        metadata: { awb: result.awb, provider: logistics.config.providerKey } as any,
      },
    });
  }

  return result;
}

export async function trackReturn(returnId: string, shop: string): Promise<TrackingResult | null> {
  const returnReq = await prisma.returnRequest.findFirst({
    where: { id: returnId, shop },
  });
  if (!returnReq || !returnReq.awb) return null;

  const logistics = await getDefaultLogisticsForShop(shop);
  if (!logistics) return null;

  const result = await logistics.adapter.trackShipment(returnReq.awb, logistics.credentials);

  if (result.success) {
    await prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        awbStatus: result.currentStatus,
        awbStatusCode: result.currentStatusCode,
        awbLastChecked: new Date(),
        awbFinal: result.isDelivered,
        ...(result.isDelivered ? { status: "delivered" } : {}),
      },
    });

    if (result.isDelivered && returnReq.status !== "delivered") {
      await prisma.returnEvent.create({
        data: {
          shop,
          returnId,
          type: "tracking_update",
          status: "delivered",
          message: "Package delivered to warehouse",
          actor: "system",
        },
      });
    }
  }

  return result;
}

export async function saveLogisticsConfig(
  shop: string,
  providerKey: string,
  credentials: Record<string, string>,
  isDefault: boolean = false
) {
  const { encrypt } = await import("~/utils/encryption.server");
  const adapter = logisticsRegistry.get(providerKey);
  if (!adapter) throw new Error(`Unknown logistics provider: ${providerKey}`);

  const encryptedCreds = encrypt(JSON.stringify(credentials));

  if (isDefault) {
    // Unset other defaults
    await prisma.logisticsConfig.updateMany({
      where: { shop, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.logisticsConfig.upsert({
    where: { shop_providerKey: { shop, providerKey } },
    create: {
      shop,
      providerKey,
      displayName: adapter.displayName,
      credentials: encryptedCreds,
      isDefault,
      region: adapter.region,
    },
    update: {
      credentials: encryptedCreds,
      isDefault,
      displayName: adapter.displayName,
    },
  });
}

export async function disconnectLogistics(shop: string, providerKey: string) {
  return prisma.logisticsConfig.update({
    where: { shop_providerKey: { shop, providerKey } },
    data: { isActive: false },
  });
}
