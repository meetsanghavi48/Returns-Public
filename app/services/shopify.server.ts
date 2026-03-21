import { apiVersion } from "../shopify.server";

// Helper to strip GID prefix: "gid://shopify/Order/123" → "123"
export function gidToId(gid: string): string {
  return typeof gid === "string"
    ? gid.replace(/^gid:\/\/shopify\/\w+\//, "")
    : String(gid || "");
}

// Generate a short unique ID
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  );
}

// Shopify REST API helper (uses stored access token for background/portal operations)
export async function shopifyREST(
  shop: string,
  accessToken: string,
  method: string,
  endpoint: string,
  body?: unknown,
) {
  const opts: RequestInit = {
    method,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const r = await fetch(
    `https://${shop}/admin/api/${apiVersion}/${endpoint}`,
    opts,
  );
  const text = await r.text();
  console.log(`[Shopify] ${method} ${endpoint} → ${r.status}`);
  if (!r.ok) console.error("[Shopify ERR]", text.slice(0, 400));
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

// Shopify GraphQL helper
export async function graphql(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const r = await fetch(
    `https://${shop}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  return r.json();
}

// Update order tags (add/remove)
export async function updateOrderTags(
  shop: string,
  accessToken: string,
  orderId: string,
  addTags: string[],
  removeTags: string[] = [],
) {
  const d = await shopifyREST(
    shop,
    accessToken,
    "GET",
    `orders/${orderId}.json?fields=tags`,
  );
  let tags = (d?.order?.tags || "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean);
  tags = tags.filter((t: string) => !removeTags.includes(t));
  addTags.forEach((t) => {
    if (!tags.includes(t)) tags.push(t);
  });
  await shopifyREST(shop, accessToken, "PUT", `orders/${orderId}.json`, {
    order: { id: orderId, tags: tags.join(", ") },
  });
  return tags;
}
