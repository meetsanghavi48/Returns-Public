import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { order_number, email, shop } = body;

  if (!shop) return json({ error: "Shop required" }, { status: 400 });
  if (!order_number && !email) return json({ error: "Order number or email required" }, { status: 400 });

  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const params = new URLSearchParams();
  if (order_number) params.set("order", order_number);
  if (email) params.set("email", email);

  return json({
    success: true,
    url: `${appUrl}/portal/${shop}?${params.toString()}`,
  });
};

// Also handle GET for simple redirects
export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const order = url.searchParams.get("order");

  if (!shop) return json({ error: "Shop required" }, { status: 400 });

  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const redirectUrl = order
    ? `${appUrl}/portal/${shop}?order=${order}`
    : `${appUrl}/portal/${shop}`;

  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl },
  });
};
