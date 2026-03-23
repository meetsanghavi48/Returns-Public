import type { LoaderFunctionArgs } from "@remix-run/node";

// Health check endpoint - keeps Render free tier alive
// No auth required, lightweight response
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};
