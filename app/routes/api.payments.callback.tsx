import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { handlePaymentCallback } from "../services/payments.server";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c),
  );
}

// Easebuzz payment callback handler
// Called by Easebuzz after payment success/failure
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type"); // "success" or "failure"
  const isSuccess = type === "success";

  const appOrigin = process.env.SHOPIFY_APP_URL || "https://returns-public.onrender.com";

  try {
    const body = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of body.entries()) {
      params[key] = String(value);
    }

    const txnid = params.txnid;
    if (!txnid) return json({ error: "Missing txnid" }, { status: 400 });

    const result = await handlePaymentCallback(txnid, params, isSuccess);

    const safeStatus = isSuccess ? "success" : "failed";
    const safeTxnid = escapeHtml(txnid);
    const safeReqId = escapeHtml(result.reqId || "");
    const safeOrderId = escapeHtml(result.orderId || "");

    // Return HTML that sends a postMessage to the parent window
    const html = `<!DOCTYPE html>
<html><head><title>Payment ${safeStatus}</title></head>
<body>
<script>
  try {
    window.opener.postMessage({
      type: 'easebuzz_payment',
      status: '${safeStatus}',
      txnid: '${safeTxnid}',
      reqId: '${safeReqId}',
      orderId: '${safeOrderId}'
    }, '${escapeHtml(appOrigin)}');
    window.close();
  } catch(e) {
    document.body.innerHTML = '<h2>Payment ${isSuccess ? "Successful" : "Failed"}</h2><p>You can close this window.</p>';
  }
</script>
<h2>Payment ${isSuccess ? "Successful" : "Failed"}</h2>
<p>You can close this window.</p>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e: any) {
    console.error("[Payment Callback]", e.message);
    return new Response(
      `<html><body><h2>Error</h2><p>Payment processing failed. Please try again or contact support.</p></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 },
    );
  }
};
