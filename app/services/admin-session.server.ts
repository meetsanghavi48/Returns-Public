import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

const secret = process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET;
if (!secret) throw new Error("SESSION_SECRET or SHOPIFY_API_SECRET environment variable is required");

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "strict",
    secrets: [secret],
    secure: true,
  },
});

function signShop(shop: string): string {
  return crypto.createHmac("sha256", secret).update(shop).digest("hex");
}

export async function createAdminSession(shop: string, redirectTo: string, userId?: string) {
  const session = await sessionStorage.getSession();
  session.set("shop", shop);
  session.set("sig", signShop(shop));
  if (userId) session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function getAdminSession(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const shop = session.get("shop");
  const sig = session.get("sig");
  if (!shop || !sig) return null;
  if (sig !== signShop(shop)) return null;
  return shop;
}

export async function getSessionUserId(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return session.get("userId") || null;
}

export async function requireAdminAuth(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const shop = session.get("shop");
  const sig = session.get("sig");
  const userId = session.get("userId");
  if (!shop || !sig || sig !== signShop(shop)) throw redirect("/admin/login");

  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  if (!shopRecord || shopRecord.uninstalledAt) throw redirect("/admin/login");

  // Verify user still exists and belongs to this shop
  if (userId) {
    const user = await prisma.appUser.findFirst({ where: { id: userId, shop, isActive: true } });
    if (!user) throw redirect("/admin/login");
  }

  return { shop, accessToken: shopRecord.accessToken, userId };
}

export async function destroyAdminSession(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/admin/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}

// Permission check helper
export function hasPermission(user: any, section: string, action: string): boolean {
  if (user?.role === "owner") return true;
  const perms = user?.permissions as any;
  return perms?.[section]?.includes(action) || false;
}
