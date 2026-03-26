interface NotificationParams {
  to: string;
  subject: string;
  html: string;
}

interface ReturnItem {
  title?: string;
  quantity?: number;
  reason?: string;
}

interface EmailTemplateParams {
  brandName: string;
  title: string;
  body: string;
}

interface SettingsValue {
  value?: string;
}

async function getSenderInfo(
  prisma: typeof import("../db.server").default,
  shop: string,
): Promise<{ email: string; name: string }> {
  const senderEmail = await prisma.settings.findFirst({ where: { shop, key: "store_email" } });
  const brandName = await prisma.settings.findFirst({ where: { shop, key: "brandName" } });
  const email = (senderEmail?.value as any)?.value || process.env.SENDER_EMAIL || "noreply@returnsmanager.app";
  const name = (brandName?.value as any)?.value || "Returns Manager";
  return { email, name };
}

async function sendEmail(params: NotificationParams & { shop?: string }): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("SENDGRID_API_KEY not set, skipping email");
    return false;
  }

  let senderEmail = process.env.SENDER_EMAIL || "noreply@returnsmanager.app";
  let senderName = "Returns Manager";

  if (params.shop) {
    try {
      const { default: prisma } = await import("../db.server");
      const info = await getSenderInfo(prisma, params.shop);
      senderEmail = info.email;
      senderName = info.name;
    } catch {}
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: senderEmail, name: senderName },
        subject: params.subject,
        content: [{ type: "text/html", value: params.html }],
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("SendGrid error:", error);
    return false;
  }
}

async function getBrandName(
  prisma: typeof import("../db.server").default,
  shop: string,
): Promise<string> {
  const brandSetting = await prisma.settings.findFirst({
    where: { shop, key: "brandName" },
  });
  if (!brandSetting) return "Returns Manager";
  const settingValue = brandSetting.value as unknown as SettingsValue;
  return String(settingValue?.value || "Returns Manager");
}

export async function sendReturnConfirmation(returnId: string, shop: string): Promise<void> {
  const { default: prisma } = await import("../db.server");
  const ret = await prisma.returnRequest.findFirst({ where: { id: returnId, shop } });
  if (!ret || !ret.customerEmail) return;

  const brandName = await getBrandName(prisma, shop);

  const items = (ret.items as ReturnItem[]) || [];
  const itemsList = items
    .map(
      (i) =>
        `<li>${i.title || "Unknown Item"} (Qty: ${i.quantity || 1}) - ${i.reason || "N/A"}</li>`,
    )
    .join("");

  await sendEmail({
    to: ret.customerEmail,
    shop,
    subject: `Return Request #${ret.reqNum || ret.reqId} Confirmed - ${brandName}`,
    html: buildEmailTemplate({
      brandName,
      title: "Return Request Confirmed",
      body: `
        <p>Hi ${ret.customerName || "there"},</p>
        <p>Your return request has been received successfully.</p>
        <p><strong>Request ID:</strong> ${ret.reqId}</p>
        <p><strong>Order:</strong> ${ret.orderNumber || ret.orderId}</p>
        <p><strong>Type:</strong> ${ret.requestType}</p>
        <p><strong>Items:</strong></p>
        <ul>${itemsList}</ul>
        ${ret.awb ? `<p><strong>AWB:</strong> ${ret.awb}</p>` : ""}
        <p>We'll keep you updated on the status of your return.</p>
      `,
    }),
  });
}

export async function sendStatusUpdate(
  returnId: string,
  shop: string,
  newStatus: string,
): Promise<void> {
  const { default: prisma } = await import("../db.server");
  const ret = await prisma.returnRequest.findFirst({ where: { id: returnId, shop } });
  if (!ret || !ret.customerEmail) return;

  const statusMessages: Record<string, string> = {
    approved: "Your return request has been approved.",
    rejected: "Your return request has been declined.",
    pickup_scheduled: `A pickup has been scheduled. AWB: ${ret.awb || "pending"}`,
    in_transit: "Your return package is in transit.",
    delivered: "Your return package has been received at our warehouse.",
    refunded: `Your refund of ₹${ret.refundAmount || 0} has been processed.`,
    exchanged: `Your exchange order ${ret.exchangeOrderName || ""} has been created.`,
  };

  const message =
    statusMessages[newStatus] || `Your return status has been updated to: ${newStatus}`;

  const brandName = await getBrandName(prisma, shop);

  await sendEmail({
    to: ret.customerEmail,
    shop,
    subject: `Return Update: ${newStatus.replace(/_/g, " ").toUpperCase()} - ${brandName}`,
    html: buildEmailTemplate({
      brandName,
      title: `Return ${newStatus.replace(/_/g, " ")}`,
      body: `
        <p>Hi ${ret.customerName || "there"},</p>
        <p>${message}</p>
        <p><strong>Request ID:</strong> ${ret.reqId}</p>
        <p><strong>Order:</strong> ${ret.orderNumber || ret.orderId}</p>
      `,
    }),
  });
}

function buildEmailTemplate(params: EmailTemplateParams): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="border-bottom: 3px solid #000; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 24px;">${params.brandName}</h1>
      </div>
      <h2 style="font-size: 20px; margin-bottom: 16px;">${params.title}</h2>
      ${params.body}
      <div style="border-top: 1px solid #eee; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #999;">
        <p>${params.brandName} Returns</p>
      </div>
    </body>
    </html>
  `;
}
