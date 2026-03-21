import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { handlePaymentCallback } from "../services/payments.server";

// Easebuzz payment callback handler
// Called by Easebuzz after payment success/failure
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type"); // "success" or "failure"
  const isSuccess = type === "success";

  try {
    const body = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of body.entries()) {
      params[key] = String(value);
    }

    const txnid = params.txnid;
    if (!txnid) return json({ error: "Missing txnid" }, { status: 400 });

    const result = await handlePaymentCallback(txnid, params, isSuccess);

    // Return HTML that sends a postMessage to the parent window
    const html = `<!DOCTYPE html>
<html><head><title>Payment ${isSuccess ? "Success" : "Failed"}</title></head>
<body>
<script>
  try {
    window.opener.postMessage({
      type: 'easebuzz_payment',
      status: '${isSuccess ? "success" : "failed"}',
      txnid: '${txnid}',
      reqId: '${result.reqId || ""}',
      orderId: '${result.orderId || ""}'
    }, '*');
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
      `<html><body><h2>Error</h2><p>${e.message}</p></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 },
    );
  }
};
