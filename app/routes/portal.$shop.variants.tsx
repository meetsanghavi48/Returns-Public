import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { shopifyREST } from "../services/shopify.server";

// Fetches product variants for the exchange selector in the portal
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const shopDomain = params.shop!;
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");

  if (!productId) {
    return json({ product_id: null, variants: [] });
  }

  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
  });
  if (!shopRecord?.accessToken) {
    return json({ product_id: productId, variants: [] });
  }

  try {
    const data = await shopifyREST(
      shopDomain,
      shopRecord.accessToken,
      "GET",
      `products/${productId}.json?fields=id,variants`,
    );

    const variants = (data?.product?.variants || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      inventory_quantity: v.inventory_quantity,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
    }));

    return json({ product_id: productId, variants });
  } catch (e: any) {
    console.error("[Portal Variants]", e.message);
    return json({ product_id: productId, variants: [] });
  }
};
