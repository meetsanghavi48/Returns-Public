import prisma from "../db.server";
import { uid } from "./shopify.server";
import { updateOrderTags } from "./shopify.server";
import { auditLog } from "./audit.server";
import { getSetting } from "./settings.server";
import { runAutomationsForReturn } from "./automation.server";
import { sendNotification } from "./email-templates.server";

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
    multipleReturnsMode?: "new" | "append";
    existingRequestId?: string;
  },
) {
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

  // --- APPEND MODE: add items to existing pending/approved request ---
  if (data.multipleReturnsMode === "append" && data.existingRequestId) {
    const existing = await prisma.returnRequest.findUnique({
      where: { reqId: data.existingRequestId },
    });
    if (existing && (existing.status === "pending" || existing.status === "approved")) {
      const existingItems = (existing.items as any[]) || [];
      const mergedItems = [...existingItems, ...items];
      const mergedTotal = mergedItems.reduce(
        (s, i) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1), 0,
      );

      // Recalculate type
      const mergedHasReturn = mergedItems.some((i) => i.action === "return");
      const mergedHasExchange = mergedItems.some((i) => i.action === "exchange");
      const mergedType = mergedHasReturn && mergedHasExchange ? "mixed"
        : mergedHasExchange ? "exchange" : "return";

      await prisma.returnRequest.update({
        where: { reqId: data.existingRequestId },
        data: {
          items: mergedItems as any,
          totalPrice: mergedTotal,
          requestType: mergedType,
        },
      });

      await auditLog(
        shop,
        data.orderId,
        data.existingRequestId,
        "items_appended",
        "customer",
        `Added ${items.length} items | New total: ₹${mergedTotal}`,
      );

      return data.existingRequestId;
    }
  }

  // --- NEW REQUEST MODE ---
  const reqId = uid();

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

  // Increment billing usage
  try {
    await prisma.billingUsage.upsert({
      where: { shop },
      update: { requestsUsed: { increment: 1 } },
      create: { shop, requestsUsed: 1, billingCycleEnd: new Date(Date.now() + 30 * 86400000) },
    });
  } catch (e: any) {
    console.error("[Billing] increment error:", e.message);
  }

  // Send notification
  const eventKey = requestType === "exchange" ? "exchange_raised" : "return_raised";
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  sendNotification(shop, eventKey, reqId, {
    customer_name: data.customerName || "Customer",
    customer_email: data.customerEmail || "",
    order_number: data.orderNumber || data.orderId,
    request_id: reqId,
    items_list: items.map((i: any) => `${i.title || "Item"} x${i.qty || 1}`).join(", "),
    portal_url: `${appUrl}/portal/${shop}/tracking/${reqId}`,
    tracking_url: `${appUrl}/portal/${shop}/tracking/${reqId}`,
    store_name: shop.replace(".myshopify.com", ""),
    refund_method: data.refundMethod || "pending",
    awb_number: "Pending",
    refund_amount: "Pending",
  }).catch((e) => console.error("[Notification] send error:", e.message));

  // Run automation rules for the new return
  const returnRecord = await prisma.returnRequest.findFirst({ where: { reqId, shop } });
  if (returnRecord) {
    runAutomationsForReturn(returnRecord.id, shop, accessToken, "return_created").catch((e) =>
      console.error("[Automation] return_created trigger error:", e.message),
    );
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

// Apply post-action policies based on settings
async function applyPostActionPolicies(
  shop: string,
  accessToken: string,
  reqId: string,
  action: "refunded" | "exchanged" | "rejected",
) {
  try {
    const request = await prisma.returnRequest.findUnique({ where: { reqId } });
    if (!request) return;

    // Auto-archive after refund
    if (action === "refunded") {
      const autoArchive = await getSetting<boolean>(shop, "auto_archive_on_refund", false);
      if (autoArchive) {
        await prisma.returnRequest.update({
          where: { reqId },
          data: { status: "archived", archivedAt: new Date() },
        });
        await auditLog(shop, request.orderId, reqId, "auto_archived", "system", "Auto-archived after refund");
      }
    }

    // Auto-archive after exchange
    if (action === "exchanged") {
      const autoArchive = await getSetting<boolean>(shop, "auto_archive_on_exchange", false);
      if (autoArchive) {
        await prisma.returnRequest.update({
          where: { reqId },
          data: { status: "archived", archivedAt: new Date() },
        });
        await auditLog(shop, request.orderId, reqId, "auto_archived", "system", "Auto-archived after exchange");
      }
    }

    // Auto-refund additional payment for rejected requests
    if (action === "rejected") {
      const autoRefund = await getSetting<boolean>(shop, "auto_refund_rejected", false);
      if (autoRefund) {
        await auditLog(shop, request.orderId, reqId, "auto_refund_rejected", "system", "Flagged for auto-refund on rejection");
      }
    }
  } catch (e: any) {
    console.error("[postActionPolicies]", e.message);
  }
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

  // Try auto pickup if logistics configured
  const { getDefaultLogisticsForShop, createPickupForReturn } = await import("./logistics.server");
  const defaultLogistics = await getDefaultLogisticsForShop(shop);
  if (defaultLogistics) {
    try {
      const pickupResult = await createPickupForReturn(request.id, shop);
      if (!pickupResult.success) {
        throw new Error(pickupResult.error || "Pickup creation failed");
      }
    } catch (pickupErr: any) {
      // Revert to pending on pickup failure
      await prisma.returnRequest.update({
        where: { reqId },
        data: { status: "pending", approvedAt: null },
      });
      await prisma.returnEvent.create({
        data: {
          shop,
          returnId: request.id,
          type: "pickup_failed",
          message: pickupErr.message,
          actor: "system",
          metadata: { error: pickupErr.message } as any,
        },
      });
      await auditLog(shop, request.orderId, reqId, "pickup_failed", "system", pickupErr.message);
      throw new Error("Pickup creation failed. Return moved back to Pending. Please try again or connect a logistics partner in Settings.");
    }
  }

  // Send approval notification
  const approveEvent = request.requestType === "exchange" ? "exchange_approved" : "return_approved";
  sendNotification(shop, approveEvent, reqId, {
    customer_name: request.customerName || "Customer",
    customer_email: request.customerEmail || "",
    order_number: request.orderNumber || request.orderId,
    request_id: reqId,
    awb_number: request.awb || "",
  }).catch((e) => console.error("[Notification] send error:", e.message));

  // Run automation rules on status change
  runAutomationsForReturn(request.id, shop, accessToken, "status_changed").catch((e) =>
    console.error("[Automation] status_changed trigger error:", e.message),
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

  // Send rejection notification
  sendNotification(shop, "return_rejected", reqId, {
    customer_name: request.customerName || "Customer",
    customer_email: request.customerEmail || "",
    order_number: request.orderNumber || request.orderId,
    request_id: reqId,
    rejection_reason: reason || "Does not meet return policy requirements",
  }).catch((e) => console.error("[Notification] send error:", e.message));

  await applyPostActionPolicies(shop, accessToken, reqId, "rejected");

  // Run automation rules on status change
  runAutomationsForReturn(request.id, shop, accessToken, "status_changed").catch((e) =>
    console.error("[Automation] status_changed trigger error:", e.message),
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
