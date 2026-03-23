import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } =
    await authenticate.webhook(request);

  console.log(`Webhook received: ${topic} from ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      // Mark shop as uninstalled (keep data for potential re-install)
      await prisma.shop.update({
        where: { shop },
        data: { uninstalledAt: new Date(), accessToken: "" },
      }).catch(() => {});
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return new Response("OK", { status: 200 });
};
