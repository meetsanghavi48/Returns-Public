import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useSubmit } from "@remix-run/react";
import { createAdminSession, getAdminSession } from "../services/admin-session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // If already has a valid admin session, redirect to dashboard
  const shop = await getAdminSession(request);
  if (shop) {
    const shopRecord = await prisma.shop.findUnique({ where: { shop } });
    if (shopRecord && !shopRecord.uninstalledAt) {
      return redirect("/admin/dashboard");
    }
  }

  // Check for shop in query params (from iframe redirect or direct link)
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  if (shopParam) {
    // Verify shop exists and has a valid access token
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopParam } });
    if (shopRecord && shopRecord.accessToken && !shopRecord.uninstalledAt) {
      // Check if owner exists
      const owner = await prisma.appUser.findFirst({ where: { shop: shopParam, role: "owner" } });
      if (!owner) {
        return redirect(`/admin/signup?shop=${shopParam}`);
      }
      return createAdminSession(shopParam, "/admin/dashboard");
    }
  }

  // No session, no shop param — redirect to login
  return redirect("/admin/login");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = (formData.get("shop") as string || "").trim().toLowerCase();

  if (!shop) return json({ error: "Shop domain is required" });

  // Normalize shop domain
  const normalizedShop = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;

  // Check if shop exists and is installed
  const shopRecord = await prisma.shop.findUnique({ where: { shop: normalizedShop } });
  if (shopRecord && shopRecord.accessToken && !shopRecord.uninstalledAt) {
    const owner = await prisma.appUser.findFirst({ where: { shop: normalizedShop, role: "owner" } });
    if (!owner) {
      return redirect(`/admin/signup?shop=${normalizedShop}`);
    }
    return createAdminSession(normalizedShop, "/admin/dashboard");
  }

  // Shop not installed — redirect to Shopify OAuth
  return redirect(`/auth/login?shop=${normalizedShop}`);
};

export default function AdminAuth() {
  const submit = useSubmit();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(formData, { method: "post" });
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#f5f5f5",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        padding: 40,
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        width: 400,
        textAlign: "center",
      }}>
        <div style={{
          width: 48,
          height: 48,
          background: "#6c5ce7",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          fontSize: 24,
          color: "#fff",
        }}>R</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Returns Manager</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>Sign in to your dashboard</p>
        <form onSubmit={handleSubmit}>
          <input
            name="shop"
            type="text"
            placeholder="your-store.myshopify.com"
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              marginBottom: 12,
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#6c5ce7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
