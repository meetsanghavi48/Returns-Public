import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

// GDPR mandatory webhooks for public Shopify apps
// These are called by Shopify for data privacy compliance

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || "";

  try {
    const payload = await request.json();

    switch (topic) {
      case "customers/data_request": {
        // Shopify requests customer data — respond with what we store
        const shopDomain = payload.shop_domain;
        const customerId = payload.customer?.id;
        console.log(
          `[GDPR] Data request for customer ${customerId} from ${shopDomain}`,
        );
        // We store minimal customer data in return requests (name, email)
        // In production, you would compile and return this data
        return json({ received: true });
      }

      case "customers/redact": {
        // Shopify requests customer data deletion
        const shopDomain = payload.shop_domain;
        const customerId = payload.customer?.id;
        console.log(
          `[GDPR] Customer redact for ${customerId} from ${shopDomain}`,
        );
        // Anonymize customer data in return requests
        await prisma.returnRequest.updateMany({
          where: {
            shop: shopDomain,
            customerEmail: payload.customer?.email,
          },
          data: {
            customerName: "[REDACTED]",
            customerEmail: "[REDACTED]",
            address: null,
          },
        });
        return json({ received: true });
      }

      case "shop/redact": {
        // Shopify requests shop data deletion (48 hours after uninstall)
        const shopDomain = payload.shop_domain;
        console.log(`[GDPR] Shop redact for ${shopDomain}`);
        // Delete all shop data
        await prisma.returnRequest.deleteMany({ where: { shop: shopDomain } });
        await prisma.auditLog.deleteMany({ where: { shop: shopDomain } });
        await prisma.settings.deleteMany({ where: { shop: shopDomain } });
        await prisma.payment.deleteMany({ where: { shop: shopDomain } });
        await prisma.exchangeCounter.deleteMany({ where: { shop: shopDomain } });
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
