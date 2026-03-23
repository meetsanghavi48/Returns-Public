import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

const secret = process.env.SHOPIFY_API_SECRET || "default-secret";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "lax",
    secrets: [secret],
    secure: process.env.NODE_ENV === "production",
  },
});

function signShop(shop: string): string {
  return crypto.createHmac("sha256", secret).update(shop).digest("hex");
}

export async function createAdminSession(shop: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("shop", shop);
  session.set("sig", signShop(shop));
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

export async function requireAdminAuth(request: Request) {
  const shop = await getAdminSession(request);
  if (!shop) throw redirect("/auth/login");

  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  if (!shopRecord || shopRecord.uninstalledAt) throw redirect("/auth/login");

  return { shop, accessToken: shopRecord.accessToken };
}

export async function destroyAdminSession(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/auth/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
