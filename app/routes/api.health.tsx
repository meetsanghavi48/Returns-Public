import prisma from "../db.server";

// Health check endpoint — works even without DB or Shopify config
// No auth required, lightweight response
export const loader = async () => {
  let dbOk = false;
  let dbError = "";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e: any) {
    dbError = e.message || "Unknown DB error";
  }

  return Response.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: {
      hasDb: !!process.env.DATABASE_URL,
      hasShopify: !!process.env.SHOPIFY_API_KEY,
      hasAppUrl: !!process.env.SHOPIFY_APP_URL,
      hasEncryption: !!process.env.ENCRYPTION_KEY,
      hasSendgrid: !!process.env.SENDGRID_API_KEY,
      nodeEnv: process.env.NODE_ENV || "development",
    },
    db: {
      connected: dbOk,
      error: dbError || undefined,
    },
  });
};
