import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Form, useNavigation } from "@remix-run/react";
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

// Simple in-memory rate limiter for auth endpoints
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await getAdminSession(request);
  if (shop) {
    const shopRecord = await prisma.shop.findUnique({ where: { shop } });
    if (shopRecord && !shopRecord.uninstalledAt) {
      return createAdminSession(shop, "/admin/dashboard");
    }
  }
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = (formData.get("email") as string || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";

  if (!email || !password) return json({ error: "Email and password are required" });

  // Validate email format
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email format" });
  }

  // Rate limit by email
  const rateLimitKey = `login:${email}`;
  if (!checkRateLimit(rateLimitKey)) {
    return json({ error: "Too many login attempts. Please try again in 15 minutes." }, { status: 429 });
  }

  // Find user by email across all shops
  const user = await prisma.appUser.findFirst({
    where: { email, isActive: true, inviteAccepted: true },
  });
  if (!user || !user.passwordHash) return json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return json({ error: "Invalid email or password" });

  // Update last login
  await prisma.appUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return createAdminSession(user.shop, "/admin/dashboard", user.id);
};

export default function AdminLogin() {
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
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 400, textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, background: "#6c5ce7", borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", fontSize: 24, color: "#fff",
        }}>R</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Returns Manager</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>Sign in to your dashboard</p>

        {actionData?.error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {actionData.error}
          </div>
        )}

        <Form method="post">
          <input
            name="email"
            type="email"
            placeholder="Email address"
            required
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14,
              border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12,
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              name="password"
              type={showPw ? "text" : "password"}
              placeholder="Password"
              required
              style={{
                width: "100%", padding: "10px 14px", fontSize: 14,
                border: "1px solid #e5e7eb", borderRadius: 8,
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280",
              }}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14, fontWeight: 600,
              background: "#6c5ce7", color: "#fff", border: "none", borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isLoading ? "Signing in..." : "Login"}
          </button>
        </Form>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 16 }}>
          <a href="/admin/signup" style={{ color: "#6c5ce7", textDecoration: "none" }}>Create an account</a>
        </p>
      </div>
    </div>
  );
}
