import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

const SUPPORTED_PROVIDERS = [
  "plobal", "appmaker", "magenative", "appokart", "appbrew",
  "swipecart", "estore2app", "customer_dashboard_pro", "hulkapps",
  "tapcart", "vajro",
] as const;

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = params.provider;

  // Return embed URL or configuration for mobile app builders
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "shop parameter required" }, { status: 400 });
  }

  return json({
    provider,
    embedUrl: `https://returns-public.onrender.com/portal/${shop}`,
    status: "available",
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  // Handle configuration updates from mobile app builder
  const provider = params.provider;
  const body = await request.json();

  console.log(`[Mobile] ${provider} config:`, body);

  return json({ success: true, provider });
}
