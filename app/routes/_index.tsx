import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Preserve all query params (id_token, shop, hmac, etc.) when redirecting
  return redirect(`/app${url.search}`);
};
