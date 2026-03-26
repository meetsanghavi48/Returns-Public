import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Form, useNavigation, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { createAdminSession, getAdminSession } from "../services/admin-session.server";
import prisma from "../db.server";
import bcrypt from "bcryptjs";
import type { LinksFunction } from "@remix-run/node";
import adminStyles from "../styles/admin.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: adminStyles },
];

export const handle = { isPublic: true };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || "";

  // If already logged in, redirect
  const shop = await getAdminSession(request);
  if (shop) {
    return createAdminSession(shop, "/admin/dashboard");
  }

  return json({ shop: shopParam });
};

// Simple in-memory rate limiter
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
function checkSignupLimit(key: string): boolean {
  const now = Date.now();
  const entry = signupAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    signupAttempts.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shopDomain = (formData.get("shop") as string || "").trim().toLowerCase();
  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";
  const confirmPassword = (formData.get("confirmPassword") as string) || "";

  if (!shopDomain) return json({ error: "Store domain is required" });
  if (!name || name.length > 100) return json({ error: "Name is required (max 100 chars)" });
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Valid email is required" });
  if (password.length < 8 || password.length > 128) return json({ error: "Password must be 8-128 characters" });
  if (password !== confirmPassword) return json({ error: "Passwords do not match" });

  // Rate limit signups by email
  if (!checkSignupLimit(`signup:${email}`)) {
    return json({ error: "Too many signup attempts. Please try again later." }, { status: 429 });
  }

  const normalizedShop = shopDomain.includes(".myshopify.com") ? shopDomain : `${shopDomain}.myshopify.com`;

  // Check shop exists
  const shopRecord = await prisma.shop.findUnique({ where: { shop: normalizedShop } });
  if (!shopRecord) return json({ error: "Store not found. Please install the app first." });

  // Check if owner already exists
  const existingOwner = await prisma.appUser.findFirst({
    where: { shop: normalizedShop, role: "owner" },
  });
  if (existingOwner) return json({ error: "An owner account already exists for this store. Please login instead." });

  // Hash password and create user
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.appUser.create({
    data: {
      shop: normalizedShop,
      email,
      name,
      role: "owner",
      isActive: true,
      inviteAccepted: true,
      passwordHash,
      permissions: {
        home: ["view"],
        request: ["view", "create", "approve", "reject", "delete"],
        customer: ["view"],
        export: ["download"],
        analytics: ["view"],
        settings: ["general", "logistics", "reasons", "policies", "users", "notifications", "billing", "automation", "payments", "integrations", "locations"],
      },
    },
  });

  // Init billing
  await prisma.billingUsage.upsert({
    where: { shop: normalizedShop },
    update: { usersUsed: 1 },
    create: { shop: normalizedShop, usersUsed: 1, billingCycleEnd: new Date(Date.now() + 30 * 86400000) },
  });

  return createAdminSession(normalizedShop, "/admin/dashboard", user.id);
};

export default function AdminSignup() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [showPw, setShowPw] = useState(false);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "#f5f5f5",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        background: "#fff", padding: 40, borderRadius: 12,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 440, textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, background: "#6c5ce7", borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", fontSize: 24, color: "#fff",
        }}>R</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Create your account</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>Set up your Returns Manager admin access</p>

        {actionData?.error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16, textAlign: "left" }}>
            {actionData.error}
          </div>
        )}

        <Form method="post">
          <input name="shop" type="text" placeholder="your-store.myshopify.com" defaultValue={shop} required
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
          <input name="name" type="text" placeholder="Your name" required
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
          <input name="email" type="email" placeholder="Email address" required
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input name="password" type={showPw ? "text" : "password"} placeholder="Password (min 8 chars)" required minLength={8}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" }} />
            <button type="button" onClick={() => setShowPw(!showPw)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <input name="confirmPassword" type={showPw ? "text" : "password"} placeholder="Confirm password" required minLength={8}
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 16, fontFamily: "inherit", boxSizing: "border-box" }} />
          <button type="submit" disabled={isLoading}
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, fontWeight: 600, background: "#6c5ce7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
            {isLoading ? "Creating..." : "Create Account"}
          </button>
        </Form>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 16 }}>
          Already have an account? <a href="/admin/login" style={{ color: "#6c5ce7", textDecoration: "none" }}>Login</a>
        </p>
      </div>
    </div>
  );
}
