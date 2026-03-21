import prisma from "../db.server";

// Get a single setting value for a shop
export async function getSetting<T = unknown>(
  shop: string,
  key: string,
  defaultValue?: T,
): Promise<T> {
  const row = await prisma.settings.findUnique({
    where: { shop_key: { shop, key } },
  });
  return (row?.value as T) ?? (defaultValue as T);
}

// Set a single setting value for a shop
export async function setSetting(
  shop: string,
  key: string,
  value: unknown,
) {
  await prisma.settings.upsert({
    where: { shop_key: { shop, key } },
    update: { value: value as any },
    create: { shop, key, value: value as any },
  });
}

// Get all settings for a shop as a flat object
export async function getAllSettings(shop: string): Promise<Record<string, unknown>> {
  const rows = await prisma.settings.findMany({ where: { shop } });
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Get shop config (from Shop table)
export async function getShopConfig(shop: string) {
  return prisma.shop.findUnique({ where: { shop } });
}
