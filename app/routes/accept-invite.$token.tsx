import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;
  if (!token) throw new Response("Invalid link", { status: 400 });

  const user = await prisma.appUser.findFirst({
    where: { inviteToken: token, inviteAccepted: false },
  });

  if (!user) throw new Response("This invitation link is invalid or has already been used.", { status: 404 });

  return json({ email: user.email, name: user.name, shop: user.shop });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const token = params.token;
  if (!token) return json({ error: "Invalid token" }, { status: 400 });

  const user = await prisma.appUser.findFirst({
    where: { inviteToken: token, inviteAccepted: false },
  });

  if (!user) return json({ error: "Invalid or expired invitation" }, { status: 404 });

  await prisma.appUser.update({
    where: { id: user.id },
    data: { inviteAccepted: true, isActive: true },
  });

  return json({ ok: true, message: "Invitation accepted! You can now access the admin dashboard." });
};

export default function AcceptInvite() {
  const { email, name, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    submit(null, { method: "post" });
    setAccepted(true);
  };

  return (
    <div style={{ fontFamily: "Inter, -apple-system, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 40, maxWidth: 480, width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, background: "#6c5ce7", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color: "#fff" }}>R</div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>You're Invited!</h1>
        <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.6 }}>
          Hi {name || email},<br />
          You've been invited to manage returns for <strong>{shop}</strong>.
        </p>

        {accepted ? (
          <div style={{ background: "#ECFDF5", borderRadius: 8, padding: 16, color: "#065f46" }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Invitation accepted!</p>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>You can now access the admin dashboard.</p>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={isLoading}
            style={{
              background: "#6c5ce7", color: "#fff", border: "none", borderRadius: 8,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
              width: "100%",
            }}
          >
            {isLoading ? "Accepting..." : "Accept Invitation"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div style={{ fontFamily: "Inter, -apple-system, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 40, maxWidth: 480, width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Invalid Invitation</h1>
        <p style={{ color: "#666" }}>This invitation link is invalid or has already been used.</p>
      </div>
    </div>
  );
}
