import prisma from "../db.server";
import { getShopConfig } from "./settings.server";
import { shopifyREST, updateOrderTags } from "./shopify.server";
import { auditLog } from "./audit.server";

const DELHIVERY_BASE = "https://track.delhivery.com";

// Get Delhivery credentials for a shop
async function getDelhiveryConfig(shop: string) {
  const shopConfig = await getShopConfig(shop);
  if (!shopConfig?.delhiveryToken) {
    throw new Error("Delhivery not configured for this shop");
  }
  return {
    token: shopConfig.delhiveryToken,
    warehouse: shopConfig.delhiveryWarehouse || "Default",
  };
}

// Raw Delhivery API call
export async function delhiveryAPI(
  token: string,
  method: string,
  urlPath: string,
  body?: unknown,
  isForm?: boolean,
) {
  const url = DELHIVERY_BASE + urlPath;
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
  };
  const opts: RequestInit = { method: method || "GET", headers };

  if (body) {
    if (isForm) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = `format=json&data=${encodeURIComponent(JSON.stringify(body))}`;
    } else {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }

  const r = await fetch(url, opts);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Check pincode serviceability
export async function checkServiceability(shop: string, pincode: string) {
  const config = await getDelhiveryConfig(shop);
  const svc = await delhiveryAPI(
    config.token,
    "GET",
    `/c/api/pin-codes/json/?filter_codes=${pincode}`,
  );
  const pin =
    svc?.delivery_codes?.[0]?.postal_code || svc?.delivery_codes?.[0];
  const pickupOk = (pin?.pickup || "").toLowerCase() === "y";
  return { serviceable: pickupOk, data: svc };
}

// Track a waybill
export async function trackWaybill(shop: string, waybill: string) {
  const config = await getDelhiveryConfig(shop);
  return delhiveryAPI(
    config.token,
    "GET",
    `/api/v1/packages/json/?waybill=${waybill}`,
  );
}

// Create a Delhivery pickup for a return request
export async function createDelhiveryPickup(
  shop: string,
  accessToken: string,
  request: any,
) {
  const config = await getDelhiveryConfig(shop);
  const addr = request.address || {};
  const items = request.items || [];
  const pincode = addr.zip || addr.pincode || "";

  // Check serviceability
  if (pincode) {
    try {
      const svc = await delhiveryAPI(
        config.token,
        "GET",
        `/c/api/pin-codes/json/?filter_codes=${pincode}`,
      );
      const pin =
        svc?.delivery_codes?.[0]?.postal_code || svc?.delivery_codes?.[0];
      const pickupOk = (pin?.pickup || "").toLowerCase() === "y";
      console.log(
        `[Pickup] Pincode ${pincode} pickup serviceable:`,
        pickupOk,
      );
      if (!pickupOk && svc?.delivery_codes) {
        const err = `Pincode ${pincode} is not serviceable for pickup by Delhivery.`;
        await prisma.returnRequest.update({
          where: { reqId: request.reqId },
          data: { awbStatus: "Non-serviceable pincode: " + pincode },
        });
        throw Object.assign(new Error(err), {
          code: "NON_SERVICEABLE",
          pincode,
        });
      }
    } catch (e: any) {
      if (e.code === "NON_SERVICEABLE") throw e;
      console.error("[serviceability check]", e.message);
    }
  }

  const totalQty =
    items.reduce((s: number, i: any) => s + (parseInt(i.qty) || 1), 0) || 1;
  const totalWeight = Math.max(0.5, totalQty * 0.5);
  const totalAmount = items.reduce(
    (s: number, i: any) =>
      s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );
  const productsDesc =
    items
      .map((i: any) => `${i.title} x${parseInt(i.qty) || 1}`)
      .join(", ")
      .slice(0, 200) || "Return Shipment";
  const rvpId = `#9${request.orderNumber}_${(request.reqId || "").replace(/^[^_]+_/, "")}`;

  const payload = {
    pickup_location: { name: config.warehouse },
    shipments: [
      {
        name: (addr.name || "Customer").slice(0, 50),
        add:
          [addr.address1, addr.address2]
            .filter(Boolean)
            .join(", ")
            .slice(0, 200) || "N/A",
        pin: String(pincode || "400001"),
        city: addr.city || "",
        state: addr.province || addr.state || "",
        country: "India",
        phone:
          String(addr.phone || "")
            .replace(/[^0-9]/g, "")
            .slice(-10) || "9999999999",
        order: rvpId,
        payment_mode: "Pickup",
        products_desc: productsDesc,
        hsn_code: "62034200",
        cod_amount: "0",
        order_date: new Date().toISOString().split("T")[0],
        total_amount: String(totalAmount.toFixed(2)),
        seller_name: config.warehouse,
        seller_inv: `INV-${request.orderNumber}`,
        quantity: totalQty,
        weight: totalWeight,
        shipment_length: 30,
        shipment_width: 25,
        shipment_height: 10,
      },
    ],
  };

  console.log(
    "[Pickup] Creating for",
    request.reqId,
    "pincode:",
    pincode,
    "order:",
    rvpId,
  );
  const data = await delhiveryAPI(
    config.token,
    "POST",
    "/api/cmu/create.json",
    payload,
    true,
  );
  const waybill = data?.packages?.[0]?.waybill || data?.waybill;
  console.log("[Pickup] Response:", JSON.stringify(data).slice(0, 300));

  if (waybill) {
    await prisma.returnRequest.update({
      where: { reqId: request.reqId },
      data: {
        awb: waybill,
        awbStatus: "Pickup Scheduled",
        awbStatusCode: "X-ASP",
        status: "pickup_scheduled",
        pickupCreatedAt: new Date(),
      },
    });

    await updateOrderTags(shop, accessToken, request.orderId, [
      "pickup-scheduled",
    ]);

    // Append AWB to order note
    try {
      const fn = await shopifyREST(
        shop,
        accessToken,
        "GET",
        `orders/${request.orderId}.json?fields=note`,
      );
      const en = fn?.order?.note || "";
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
              `\nDELHIVERY AWB: ${waybill} | REQ: ${request.reqId} | ${new Date().toISOString()}`
            ).slice(0, 5000),
          },
        },
      );
    } catch (e: any) {
      console.error("[Pickup] Note update failed:", e.message);
    }

    await auditLog(
      shop,
      request.orderId,
      request.reqId,
      "pickup_created",
      "system",
      `AWB:${waybill}`,
    );
    return waybill;
  } else {
    const errMsg =
      data?.rmk ||
      data?.packages?.[0]?.remarks ||
      JSON.stringify(data).slice(0, 300);
    console.error("[Pickup] No waybill returned:", errMsg);
    await prisma.returnRequest.update({
      where: { reqId: request.reqId },
      data: { awbStatus: "Pickup failed: " + String(errMsg).slice(0, 120) },
    });
    throw new Error(errMsg || "Delhivery did not return a waybill");
  }
}
