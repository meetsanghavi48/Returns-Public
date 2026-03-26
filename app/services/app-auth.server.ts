import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Auth helper for embedded /app routes.
 * Uses Shopify session auth (not cookie-based admin auth).
 * Returns shop + accessToken, same interface as requireAdminAuth.
 */
export async function requireAppAuth(request: Request) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const accessToken = session.accessToken!;

  // Ensure shop record exists
  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  if (!shopRecord) {
    // Auto-create on first embedded access (afterAuth should have done this)
    await prisma.shop.upsert({
      where: { shop },
      update: { accessToken, uninstalledAt: null },
      create: { shop, accessToken, scopes: session.scope || "" },
    });
  }

  return { shop, accessToken };
}
