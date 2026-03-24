import { json, type ActionFunctionArgs } from "@remix-run/node";

// Supported chat providers
const SUPPORTED_PROVIDERS = [
  "limechat", "interakt", "spur", "convertway", "richpanel",
  "freshdesk", "zendesk", "gorgias", "wati", "zoko", "delightchat",
] as const;

type ChatProvider = typeof SUPPORTED_PROVIDERS[number];

export async function action({ request, params }: ActionFunctionArgs) {
  const provider = params.provider as string;

  if (!SUPPORTED_PROVIDERS.includes(provider as ChatProvider)) {
    return json({ error: `Unknown chat provider: ${provider}` }, { status: 400 });
  }

  try {
    const body = await request.json();

    console.log(`[Chat Webhook] ${provider}:`, JSON.stringify(body).slice(0, 500));

    // TODO: Process webhook payload based on provider
    // Each provider has different payload structures
    // For now, log and acknowledge

    return json({ received: true, provider });
  } catch (error) {
    console.error(`[Chat Webhook] ${provider} error:`, error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
}

// Some providers send GET for verification
export async function loader({ params }: ActionFunctionArgs) {
  return json({ status: "ok", provider: params.provider });
}
