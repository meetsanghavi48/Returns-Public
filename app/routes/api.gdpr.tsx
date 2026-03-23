import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

// GDPR mandatory webhooks for public Shopify apps
// These are called by Shopify for data privacy compliance

function verifyShopifyHmac(body: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(hmacHeader),
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyHmac(rawBody, hmac)) {
    console.error("[GDPR] HMAC verification failed");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const topic =
    request.headers.get("x-shopify-topic") ||
    url.searchParams.get("topic") ||
    "";

  try {
    const payload = JSON.parse(rawBody);

    switch (topic) {
      case "customers/data_request": {
        const shopDomain = payload.shop_domain;
        const customerEmail = payload.customer?.email;
        console.log(
          `[GDPR] Data request for customer ${customerEmail} from ${shopDomain}`,
        );
        const requests = await prisma.returnRequest.findMany({
          where: { shop: shopDomain, customerEmail: customerEmail || undefined },
          select: {
            reqId: true,
            orderNumber: true,
            customerName: true,
            customerEmail: true,
            status: true,
            createdAt: true,
          },
        });
        return json({ received: true, data_count: requests.length });
      }

      case "customers/redact": {
        const shopDomain = payload.shop_domain;
        const customerEmail = payload.customer?.email;
        console.log(
          `[GDPR] Customer redact for ${customerEmail} from ${shopDomain}`,
        );
        await prisma.returnRequest.updateMany({
          where: { shop: shopDomain, customerEmail },
          data: {
            customerName: "[REDACTED]",
            customerEmail: "[REDACTED]",
            address: null,
          },
        });
        return json({ received: true });
      }

      case "shop/redact": {
        const shopDomain = payload.shop_domain;
        console.log(`[GDPR] Shop redact for ${shopDomain}`);
        await prisma.returnRequest.deleteMany({ where: { shop: shopDomain } });
        await prisma.auditLog.deleteMany({ where: { shop: shopDomain } });
        await prisma.settings.deleteMany({ where: { shop: shopDomain } });
        await prisma.payment.deleteMany({ where: { shop: shopDomain } });
        await prisma.exchangeCounter.deleteMany({
          where: { shop: shopDomain },
        });
        await prisma.shop.deleteMany({ where: { shop: shopDomain } });
        return json({ received: true });
      }

      default:
        return json({ error: "Unknown topic" }, { status: 400 });
    }
  } catch (e: any) {
    console.error("[GDPR]", e.message);
    return json({ error: e.message }, { status: 500 });
  }
};
