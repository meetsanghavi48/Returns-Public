import prisma from "../db.server";
import { uid } from "./shopify.server";
import { updateOrderTags } from "./shopify.server";
import { auditLog } from "./audit.server";
import { getSetting } from "./settings.server";

// Check if order items include a freebie that should be auto-added
function checkFreebieItems(
  orderTags: string,
  orderLineItems: any[],
  requestItems: any[],
  requestType: string,
) {
  if (requestType === "exchange") return requestItems;
  const tags = (orderTags || "")
    .split(",")
    .map((t) => t.trim());
  if (!tags.includes("freebie")) return requestItems;
  const hasSocks = requestItems.some((i) =>
    (i.title || "").toLowerCase().includes("sock"),
  );
  if (hasSocks) return requestItems;
  const socksItem = (orderLineItems || []).find((li) =>
    (li.title || "").toLowerCase().includes("sock"),
  );
  if (!socksItem) return requestItems;
  return [
    ...requestItems,
    {
      id: String(socksItem.id),
      title: socksItem.title,
      variant_title: socksItem.variant_title || "",
      variant_id: socksItem.variant_id,
      product_id: socksItem.product_id,
      price: socksItem.price || "0",
      qty: 1,
      action: "return",
      reason: "Freebie return",
      auto_added: true,
      image_url: socksItem.image_url || null,
    },
  ];
}

// Auto-approve a return request
async function autoApproveRequest(
  shop: string,
  accessToken: string,
  reqId: string,
  orderId: string,
  requestType: string,
) {
  try {
    const at =
      requestType === "exchange"
        ? "exchange-approved"
        : requestType === "mixed"
          ? "mixed-approved"
          : "return-approved";
    const rt =
      requestType === "exchange"
        ? "exchange-requested"
        : requestType === "mixed"
          ? "mixed-requested"
          : "return-requested";
    await updateOrderTags(shop, accessToken, orderId, [at], [rt]);
    await prisma.returnRequest.update({
      where: { reqId },
      data: { status: "approved", approvedAt: new Date() },
    });
    await auditLog(
      shop,
      orderId,
      reqId,
      "auto_approved",
      "system",
      "Auto-approved on submission",
    );
    console.log(`[AutoApprove] ${reqId}`);
  } catch (e: any) {
    console.error("[autoApprove]", e.message);
  }
}

// Submit a new return request (from customer portal)
export async function submitReturnRequest(
  shop: string,
  accessToken: string,
  data: {
    orderId: string;
    orderNumber?: string;
    customerName?: string;
    customerEmail?: string;
    items: any[];
    refundMethod?: string;
    shippingPreference?: string;
    address?: any;
    isCod?: boolean;
    daysSinceOrder?: number;
    orderTags?: string;
    orderLineItems?: any[];
  },
) {
  const reqId = uid();

  // Determine request type
  const hasReturn = data.items.some((i) => i.action === "return");
  const hasExchange = data.items.some((i) => i.action === "exchange");
  const requestType = hasReturn && hasExchange
    ? "mixed"
    : hasExchange
      ? "exchange"
      : "return";

  // Check for freebie items
  const items = checkFreebieItems(
    data.orderTags || "",
    data.orderLineItems || [],
    data.items,
    requestType,
  );

  // Calculate total price
  const totalPrice = items.reduce(
    (s, i) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );

  // Get sequential request number (separate per type)
  const counter = await prisma.returnCounter.upsert({
    where: { shop_type: { shop, type: requestType } },
    update: { lastNumber: { increment: 1 } },
    create: { shop, type: requestType, lastNumber: 1 },
  });
  const reqNum = counter.lastNumber;

  // Always create a new request (multiple returns per order allowed)
  const tag =
    requestType === "exchange"
      ? "exchange-requested"
      : requestType === "mixed"
        ? "mixed-requested"
        : "return-requested";

  await updateOrderTags(shop, accessToken, data.orderId, [tag]);

  await prisma.returnRequest.create({
    data: {
      shop,
      reqId,
      reqNum,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      items: items as any,
      refundMethod: data.refundMethod,
      shippingPreference: data.shippingPreference || "pickup",
      status: "pending",
      requestType,
      totalPrice,
      address: (data.address || null) as any,
      isCod: data.isCod || false,
      daysSinceOrder: data.daysSinceOrder || 0,
    },
  });

  await auditLog(
    shop,
    data.orderId,
    reqId,
    "request_submitted",
    "customer",
    `${requestType} | ${items.length} items | ₹${totalPrice}`,
  );

  // Auto-approve if enabled
  const autoApprove = await getSetting<boolean>(shop, "auto_approve", true);
  if (autoApprove) {
    await autoApproveRequest(shop, accessToken, reqId, data.orderId, requestType);
  }

  return reqId;
}

// Submit a manual return request (from admin dashboard)
export async function submitManualRequest(
  shop: string,
  accessToken: string,
  data: {
    orderId: string;
    orderNumber?: string;
    items: any[];
    refundMethod?: string;
    address?: any;
  },
) {
  const reqId = uid();
  const hasReturn = data.items.some((i) => i.action === "return");
  const hasExchange = data.items.some((i) => i.action === "exchange");
  const requestType = hasReturn && hasExchange
    ? "mixed"
    : hasExchange
      ? "exchange"
      : "return";

  const totalPrice = data.items.reduce(
    (s, i) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );

  // Get sequential request number (separate per type)
  const counter = await prisma.returnCounter.upsert({
    where: { shop_type: { shop, type: requestType } },
    update: { lastNumber: { increment: 1 } },
    create: { shop, type: requestType, lastNumber: 1 },
  });
  const reqNum = counter.lastNumber;

  const tag =
    requestType === "exchange"
      ? "exchange-requested"
      : requestType === "mixed"
        ? "mixed-requested"
        : "return-requested";
  await updateOrderTags(shop, accessToken, data.orderId, [tag]);

  await prisma.returnRequest.create({
    data: {
      shop,
      reqId,
      reqNum,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      items: data.items as any,
      refundMethod: data.refundMethod,
      status: "approved",
      requestType,
      totalPrice,
      address: (data.address || null) as any,
      approvedAt: new Date(),
    },
  });

  await auditLog(
    shop,
    data.orderId,
    reqId,
    "manual_request",
    "admin",
    `${requestType} | ${data.items.length} items`,
  );

  return reqId;
}

// Approve a pending request
export async function approveRequest(
  shop: string,
  accessToken: string,
  reqId: string,
) {
  const request = await prisma.returnRequest.findFirst({
    where: { shop, reqId },
  });
  if (!request) throw new Error("Request not found");

  const at =
    request.requestType === "exchange"
      ? "exchange-approved"
      : request.requestType === "mixed"
        ? "mixed-approved"
        : "return-approved";
  const rt =
    request.requestType === "exchange"
      ? "exchange-requested"
      : request.requestType === "mixed"
        ? "mixed-requested"
        : "return-requested";

  await updateOrderTags(shop, accessToken, request.orderId, [at], [rt]);
  await prisma.returnRequest.update({
    where: { reqId },
    data: { status: "approved", approvedAt: new Date() },
  });
  await auditLog(
    shop,
    request.orderId,
    reqId,
    "approved",
    "admin",
    "Manual approval",
  );
}

// Reject a pending request
export async function rejectRequest(
  shop: string,
  accessToken: string,
  reqId: string,
  reason?: string,
) {
  const request = await prisma.returnRequest.findFirst({
    where: { shop, reqId },
  });
  if (!request) throw new Error("Request not found");

  await updateOrderTags(shop, accessToken, request.orderId, [
    "return-rejected",
  ]);
  await prisma.returnRequest.update({
    where: { reqId },
    data: { status: "rejected" },
  });
  await auditLog(
    shop,
    request.orderId,
    reqId,
    "rejected",
    "admin",
    reason || "Manual rejection",
  );
}

// Archive a completed request
export async function archiveRequest(
  shop: string,
  reqId: string,
) {
  await prisma.returnRequest.update({
    where: { reqId },
    data: { status: "archived", archivedAt: new Date() },
  });
  const request = await prisma.returnRequest.findUnique({ where: { reqId } });
  if (request) {
    await auditLog(
      shop,
      request.orderId,
      reqId,
      "archived",
      "system",
      "Archived after completion",
    );
  }
}
