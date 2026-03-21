import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Root URL redirects to the app (triggers OAuth if not authenticated)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect("/app");
};
