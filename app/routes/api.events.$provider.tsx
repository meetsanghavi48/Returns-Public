import { json, type ActionFunctionArgs } from "@remix-run/node";

const SUPPORTED_PROVIDERS = [
  "klaviyo", "yotpo", "glood", "moengage", "webengage",
  "omnisend", "postscript",
] as const;

export async function action({ params, request }: ActionFunctionArgs) {
  const provider = params.provider;

  // These endpoints receive return events and forward to marketing/CRM platforms
  // TODO: Implement actual event forwarding per provider

  const body = await request.json();
  console.log(`[Marketing Event] ${provider}:`, JSON.stringify(body).slice(0, 500));

  return json({ forwarded: true, provider });
}
