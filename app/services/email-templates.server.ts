import prisma from "../db.server";

const DEFAULT_TEMPLATES: Record<string, { subject: string; htmlBody: string }> = {
  return_raised: {
    subject: "Your return request #{{request_id}} has been raised",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your return request has been successfully raised for order {{order_number}}.</p>
<p><strong>Request ID:</strong> {{request_id}}</p>
<p><strong>Items:</strong> {{items_list}}</p>
<p><strong>Status:</strong> Pending Approval</p>
<p>We'll notify you once your request is reviewed.</p>
<p><a href="{{portal_url}}">View Request Status</a></p>`,
  },
  return_approved: {
    subject: "Your return request #{{request_id}} has been approved",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Great news! Your return request for order {{order_number}} has been approved.</p>
<p><strong>AWB Number:</strong> {{awb_number}}</p>
<p>Please keep the items ready for pickup. Expected pickup: Within 2-3 business days.</p>
<p><a href="{{tracking_url}}">Track Your Return</a></p>`,
  },
  return_rejected: {
    subject: "Update on your return request #{{request_id}}",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>We're sorry, but your return request for order {{order_number}} could not be approved.</p>
<p><strong>Reason:</strong> {{rejection_reason}}</p>
<p>If you have questions, please contact us.</p>`,
  },
  return_received: {
    subject: "We've received your return #{{request_id}}",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>We have received your returned item(s) for order {{order_number}}.</p>
<p>Your refund will be processed shortly.</p>
<p><strong>Refund Method:</strong> {{refund_method}}</p>
<p><strong>Refund Amount:</strong> {{refund_amount}}</p>`,
  },
  return_qc_passed: {
    subject: "Your return #{{request_id}} has passed quality check",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your returned items for order {{order_number}} have passed our quality check. Your refund is being processed.</p>`,
  },
  return_cancelled: {
    subject: "Your return request #{{request_id}} has been cancelled",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your return request for order {{order_number}} has been cancelled.</p>`,
  },
  return_reinitiated: {
    subject: "Your return request #{{request_id}} has been re-initiated",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your return request for order {{order_number}} has been re-initiated. We'll keep you updated.</p>`,
  },
  exchange_raised: {
    subject: "Your exchange request #{{request_id}} has been raised",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your exchange request for order {{order_number}} has been raised successfully.</p>
<p><strong>Exchange Items:</strong> {{exchange_items}}</p>`,
  },
  exchange_approved: {
    subject: "Your exchange request #{{request_id}} has been approved",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your exchange request for order {{order_number}} has been approved. Your new items will be dispatched shortly.</p>`,
  },
  exchange_rejected: {
    subject: "Update on your exchange request #{{request_id}}",
    htmlBody: `<p>Hi {{customer_name}},</p>
<p>Your exchange request for order {{order_number}} could not be approved.</p>
<p><strong>Reason:</strong> {{rejection_reason}}</p>`,
  },
  exchange_received: {
    subject: "We've received your exchange item #{{request_id}}",
    htmlBody: `<p>Hi {{customer_name}},</p><p>We have received your item(s) for exchange order {{order_number}}.</p>`,
  },
  exchange_initiated: {
    subject: "Your exchange #{{request_id}} has been initiated",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your exchange for order {{order_number}} has been initiated.</p>`,
  },
  exchange_qc_passed: {
    subject: "Your exchange #{{request_id}} has passed quality check",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your exchanged items have passed QC.</p>`,
  },
  exchange_cancelled: {
    subject: "Your exchange request #{{request_id}} has been cancelled",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your exchange request for order {{order_number}} has been cancelled.</p>`,
  },
  exchange_reinitiated: {
    subject: "Your exchange #{{request_id}} has been re-initiated",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your exchange for order {{order_number}} has been re-initiated.</p>`,
  },
  refund_discount_code: {
    subject: "Your refund for #{{request_id}} - Discount Code",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your refund of {{refund_amount}} for order {{order_number}} has been issued as a discount code.</p>`,
  },
  refund_bank_transfer: {
    subject: "Your refund for #{{request_id}} - Bank Transfer Initiated",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your refund of {{refund_amount}} for order {{order_number}} has been initiated via bank transfer.</p>`,
  },
  refund_credit_note: {
    subject: "Your refund for #{{request_id}} - Credit Note",
    htmlBody: `<p>Hi {{customer_name}},</p><p>A credit note of {{refund_amount}} has been issued for order {{order_number}}.</p>`,
  },
  refund_original: {
    subject: "Your refund for #{{request_id}} - Original Payment",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your refund of {{refund_amount}} has been initiated to your original payment method for order {{order_number}}.</p>`,
  },
  refund_completed: {
    subject: "Refund completed for #{{request_id}}",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your refund of {{refund_amount}} for order {{order_number}} has been completed successfully.</p>`,
  },
  dashboard_return: {
    subject: "A return request has been created for order {{order_number}}",
    htmlBody: `<p>Hi {{customer_name}},</p><p>A return request has been created for your order {{order_number}} by our team.</p>`,
  },
  dashboard_exchange: {
    subject: "An exchange request has been created for order {{order_number}}",
    htmlBody: `<p>Hi {{customer_name}},</p><p>An exchange request has been created for your order {{order_number}} by our team.</p>`,
  },
  return_in_exchange: {
    subject: "Return in exchange for order {{order_number}}",
    htmlBody: `<p>Hi {{customer_name}},</p><p>A return-in-exchange has been raised for your order {{order_number}}.</p>`,
  },
  return_to_exchange: {
    subject: "Your return #{{request_id}} has been converted to exchange",
    htmlBody: `<p>Hi {{customer_name}},</p><p>Your return request has been converted to an exchange for order {{order_number}}.</p>`,
  },
  otp: {
    subject: "Your OTP for {{store_name}} Returns Portal",
    htmlBody: `<p>Hi,</p><p>Your OTP is: <strong>{{otp_code}}</strong></p><p>Valid for 10 minutes.</p>`,
  },
};

export async function seedNotificationTemplates(shop: string): Promise<void> {
  const existing = await prisma.emailNotification.count({ where: { shop } });
  if (existing > 0) return;

  const creates = Object.entries(DEFAULT_TEMPLATES).map(([eventKey, template]) =>
    prisma.emailNotification.create({
      data: {
        shop,
        eventKey,
        subject: template.subject,
        htmlBody: template.htmlBody,
        isEnabled: true,
      },
    })
  );

  await Promise.all(creates);
}

function buildEmailHtml(brandName: string, brandColor: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid ${brandColor}; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 24px;">${brandName}</h1>
  </div>
  ${body}
  <div style="border-top: 1px solid #eee; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #999;">
    <p>You're receiving this because you placed an order at ${brandName}.</p>
  </div>
</body>
</html>`;
}

export async function sendNotification(
  shop: string,
  eventKey: string,
  returnId: string,
  variables: Record<string, string>,
): Promise<void> {
  const template = await prisma.emailNotification.findUnique({
    where: { shop_eventKey: { shop, eventKey } },
  });

  if (!template || !template.isEnabled) return;
  if (!variables.customer_email) return;

  // Replace variables
  let subject = template.subject;
  let body = template.htmlBody;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    subject = subject.replace(pattern, value);
    body = body.replace(pattern, value);
  }

  // Get brand info
  const brandSetting = await prisma.settings.findUnique({ where: { shop_key: { shop, key: "brandName" } } });
  const brandName = (brandSetting?.value as string) || "Returns Manager";
  const brandColor = "#000";

  const html = buildEmailHtml(brandName, brandColor, body);

  // Get sender info
  const senderNameSetting = await prisma.settings.findUnique({ where: { shop_key: { shop, key: "sender_name" } } });
  const senderEmailSetting = await prisma.settings.findUnique({ where: { shop_key: { shop, key: "sender_email" } } });
  const fromName = (senderNameSetting?.value as string) || brandName;
  const fromEmail = (senderEmailSetting?.value as string) || template.senderEmail || process.env.SENDER_EMAIL || "noreply@returnsmanager.app";

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("[Notifications] SENDGRID_API_KEY not set, skipping email");
    // Still log it
    await prisma.emailLog.create({
      data: { shop, eventKey, toEmail: variables.customer_email, subject, status: "skipped", returnId },
    });
    return;
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: variables.customer_email }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    await prisma.emailLog.create({
      data: {
        shop, eventKey,
        toEmail: variables.customer_email,
        subject,
        status: response.ok ? "sent" : "failed",
        returnId,
      },
    });
  } catch (error) {
    console.error("[Notifications] SendGrid error:", error);
    await prisma.emailLog.create({
      data: { shop, eventKey, toEmail: variables.customer_email, subject, status: "error", returnId },
    });
  }
}

export function getDefaultTemplate(eventKey: string) {
  return DEFAULT_TEMPLATES[eventKey] || { subject: "", htmlBody: "" };
}
