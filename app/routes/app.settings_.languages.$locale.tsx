import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";

const TRANSLATION_KEYS: Record<string, Record<string, string>> = {
  "Portal": {
    "portal_title": "Returns & Exchanges",
    "portal_order_lookup_title": "Track your order",
    "portal_order_id_label": "Order number",
    "portal_email_label": "Email address",
    "portal_lookup_button": "Look up order",
    "portal_no_order_found": "No order found. Please check your details.",
    "portal_powered_by": "Powered by Returns Manager",
  },
  "Return Form": {
    "form_select_items": "Select Items",
    "form_select_items_desc": "Select items you want to return or exchange.",
    "form_return": "Return",
    "form_exchange": "Exchange",
    "form_select_reason": "Select a reason...",
    "form_quantity": "Quantity to return",
    "form_continue": "Continue",
    "form_confirm": "Confirm",
    "form_find_order": "Find Order",
    "form_already_returned": "Already in a return request",
    "form_not_eligible": "Not eligible for return or exchange",
  },
  "Refund Modes": {
    "refund_original": "Original payment mode",
    "refund_store_credit": "Store credit",
    "refund_bank_transfer": "Bank transfer",
    "refund_exchange": "Exchange with another product",
  },
  "Confirmation": {
    "confirm_title": "Review & Submit",
    "confirm_refund_method": "Refund method",
    "confirm_shipping": "Shipping preference",
    "confirm_pickup": "Schedule pickup",
    "confirm_self_ship": "Self-ship",
    "confirm_submit": "Submit Request",
    "confirm_success": "Your request has been submitted successfully!",
    "confirm_request_id": "Request ID",
  },
  "Status Messages": {
    "status_pending": "Pending",
    "status_approved": "Approved",
    "status_rejected": "Rejected",
    "status_pickup_scheduled": "Pickup Scheduled",
    "status_in_transit": "In Transit",
    "status_delivered": "Delivered",
    "status_refunded": "Refunded",
    "status_exchanged": "Exchanged",
  },
  "Emails": {
    "email_return_raised_subject": "Your return request has been raised",
    "email_return_approved_subject": "Your return request has been approved",
    "email_return_rejected_subject": "Update on your return request",
    "email_return_received_subject": "We've received your return",
    "email_refund_completed_subject": "Refund completed",
    "email_exchange_raised_subject": "Your exchange request has been raised",
  },
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const locale = params.locale!;
  const language = await prisma.language.findUnique({
    where: { shop_locale: { shop, locale } },
  });
  if (!language) throw new Response("Language not found", { status: 404 });
  return json({ language, translationKeys: TRANSLATION_KEYS });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const locale = params.locale!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save") {
    const translationsRaw = formData.get("translations") as string;
    const translations = JSON.parse(translationsRaw);
    await prisma.language.update({
      where: { shop_locale: { shop, locale } },
      data: { translations },
    });
    return json({ ok: true, message: "Translations saved" });
  }

  if (intent === "toggle_publish") {
    const lang = await prisma.language.findUnique({ where: { shop_locale: { shop, locale } } });
    if (lang) {
      await prisma.language.update({
        where: { shop_locale: { shop, locale } },
        data: { isPublished: !lang.isPublished },
      });
    }
    return json({ ok: true });
  }

  if (intent === "auto_translate") {
    const lang = await prisma.language.findUnique({ where: { shop_locale: { shop, locale } } });
    if (!lang) return json({ error: "Language not found" }, { status: 404 });

    const translations: Record<string, string> = {};
    const allKeys: [string, string][] = [];
    for (const category of Object.values(TRANSLATION_KEYS)) {
      for (const [key, value] of Object.entries(category)) {
        allKeys.push([key, value]);
      }
    }

    // Translate in batches using Google Translate API
    for (const [key, text] of allKeys) {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${locale.split("-")[0]}&dt=t&q=${encodeURIComponent(text)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        translations[key] = data?.[0]?.map((s: any) => s[0]).join("") || text;
      } catch {
        translations[key] = text;
      }
    }

    await prisma.language.update({
      where: { shop_locale: { shop, locale } },
      data: { translations },
    });
    return json({ ok: true, message: "Auto-translation complete", translations });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function LanguageEdit() {
  const { language, translationKeys } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const existingTranslations = (language.translations || {}) as Record<string, string>;
  const [translations, setTranslations] = useState<Record<string, string>>(existingTranslations);
  const [saved, setSaved] = useState(false);

  const updateTranslation = useCallback((key: string, value: string) => {
    setTranslations((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("translations", JSON.stringify(translations));
    submit(fd, { method: "post" });
    setSaved(true);
  }, [translations, submit]);

  const handleAutoTranslate = useCallback(() => {
    if (!confirm(`Auto-translate all strings to ${language.name}? This will overwrite existing translations.`)) return;
    const fd = new FormData();
    fd.set("intent", "auto_translate");
    submit(fd, { method: "post" });
  }, [language.name, submit]);

  const handleTogglePublish = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "toggle_publish");
    submit(fd, { method: "post" });
  }, [submit]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings/languages" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Languages</Link>
          <h1 style={{ margin: "4px 0 0" }}>{language.name} ({language.locale})</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn" onClick={handleAutoTranslate} disabled={isLoading}>
            {isLoading ? "Translating..." : "Auto-translate"}
          </button>
          <button className="admin-btn" onClick={handleTogglePublish}>
            {language.isPublished ? "Unpublish" : "Publish"}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {saved && !isLoading && (
        <div className="admin-card" style={{ background: "#ECFDF5", borderLeft: "4px solid var(--admin-success)", marginBottom: 16, padding: 12 }}>
          <p style={{ fontSize: 13, color: "#065f46", margin: 0 }}>Translations saved successfully.</p>
        </div>
      )}

      <div className="admin-card" style={{ background: language.isPublished ? "#ECFDF5" : "#FEF3C7", borderLeft: `4px solid ${language.isPublished ? "var(--admin-success)" : "var(--admin-warning)"}`, marginBottom: 24, padding: 12 }}>
        <p style={{ fontSize: 13, color: language.isPublished ? "#065f46" : "#92400e", margin: 0 }}>
          {language.isPublished ? "This language is published and visible to customers." : "This language is unpublished. Publish it to make it visible to customers."}
        </p>
      </div>

      {Object.entries(translationKeys).map(([category, keys]) => (
        <div key={category} className="admin-card" style={{ marginBottom: 24 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{category}</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: "1px solid #eee", fontSize: 12, color: "#888", width: "45%" }}>English (Source)</th>
                <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: "1px solid #eee", fontSize: 12, color: "#888", width: "45%" }}>Translation</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(keys).map(([key, englishText]) => (
                <tr key={key} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: "#555" }}>{englishText}</td>
                  <td style={{ padding: "8px 16px" }}>
                    <input
                      className="admin-input"
                      value={translations[key] || ""}
                      onChange={(e) => updateTranslation(key, e.target.value)}
                      placeholder={englishText}
                      style={{ width: "100%", fontSize: 13 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
