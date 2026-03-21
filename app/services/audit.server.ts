import prisma from "../db.server";

export async function auditLog(
  shop: string,
  orderId: string | null,
  reqId: string | null,
  action: string,
  actor: string = "system",
  details: string = "",
) {
  console.log(`[AUDIT] ${shop} #${orderId} | ${action} | ${actor} | ${details}`);
  try {
    await prisma.auditLog.create({
      data: {
        shop,
        orderId: String(orderId || ""),
        reqId: reqId || null,
        action,
        actor,
        details,
      },
    });
  } catch (e: any) {
    console.error("[auditLog]", e.message);
  }
}
