import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import prisma from "../db.server";

const AVAILABLE_LOCALES = [
  { code: "en", name: "English" }, { code: "hi", name: "Hindi" }, { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" }, { code: "de", name: "German" }, { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" }, { code: "it", name: "Italian" }, { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese Simplified" }, { code: "zh-TW", name: "Chinese Traditional" },
  { code: "ko", name: "Korean" }, { code: "nl", name: "Dutch" }, { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" }, { code: "pl", name: "Polish" }, { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" }, { code: "nb", name: "Norwegian" }, { code: "fi", name: "Finnish" },
  { code: "id", name: "Indonesian" }, { code: "ms", name: "Malay" }, { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" }, { code: "bn", name: "Bengali" }, { code: "gu", name: "Gujarati" },
  { code: "mr", name: "Marathi" }, { code: "ta", name: "Tamil" }, { code: "te", name: "Telugu" },
  { code: "kn", name: "Kannada" }, { code: "ml", name: "Malayalam" }, { code: "pa", name: "Punjabi" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const languages = await prisma.language.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });
  return json({ languages });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const locale = formData.get("locale") as string;
    const localeDef = AVAILABLE_LOCALES.find((l) => l.code === locale);
    if (!localeDef) return json({ error: "Invalid locale" }, { status: 400 });
    const existing = await prisma.language.findUnique({ where: { shop_locale: { shop, locale } } });
    if (existing) return json({ error: "Language already added" }, { status: 400 });
    const isFirst = (await prisma.language.count({ where: { shop } })) === 0;
    await prisma.language.create({
      data: { shop, locale, name: localeDef.name, isDefault: isFirst, isPublished: isFirst, translations: {} },
    });
    return json({ ok: true });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.language.delete({ where: { id } });
    return json({ ok: true });
  }

  if (intent === "toggle_publish") {
    const id = formData.get("id") as string;
    const lang = await prisma.language.findUnique({ where: { id } });
    if (lang) {
      await prisma.language.update({ where: { id }, data: { isPublished: !lang.isPublished } });
    }
    return json({ ok: true });
  }

  if (intent === "set_default") {
    const id = formData.get("id") as string;
    await prisma.language.updateMany({ where: { shop }, data: { isDefault: false } });
    await prisma.language.update({ where: { id }, data: { isDefault: true, isPublished: true } });
    return json({ ok: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SettingsLanguages() {
  const { languages } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [showModal, setShowModal] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState("");

  const existingLocales = new Set(languages.map((l: any) => l.locale));
  const availableToAdd = AVAILABLE_LOCALES.filter((l) => !existingLocales.has(l.code));
  const published = languages.filter((l: any) => l.isPublished);
  const unpublished = languages.filter((l: any) => !l.isPublished);

  const handleAdd = useCallback(() => {
    if (!selectedLocale) return;
    const fd = new FormData();
    fd.set("intent", "add");
    fd.set("locale", selectedLocale);
    submit(fd, { method: "post" });
    setShowModal(false);
    setSelectedLocale("");
  }, [selectedLocale, submit]);

  const handleAction = useCallback((intent: string, id: string) => {
    if (intent === "delete" && !confirm("Remove this language?")) return;
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", id);
    submit(fd, { method: "post" });
  }, [submit]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Settings</Link>
          <h1 style={{ margin: "4px 0 0" }}>Languages</h1>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowModal(true)}>+ Add language</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        {/* Left panel */}
        <div>
          <div className="admin-card" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#127760;</div>
            <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>
              Serve your customers in multiple languages. Greet them in the language they understand.
            </p>
          </div>
        </div>

        {/* Right panel */}
        <div>
          {/* Info banner */}
          <div className="admin-card" style={{ background: "#EFF6FF", borderLeft: "4px solid var(--admin-accent)", marginBottom: 24, padding: 16 }}>
            <p style={{ fontSize: 13, color: "#1e40af", margin: 0 }}>
              The returns portal automatically shows the correct language based on your customer's browser settings.
            </p>
          </div>

          {/* Published */}
          <div className="admin-card" style={{ marginBottom: 24 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Published languages ({published.length})</h3>
            </div>
            {published.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>No published languages. Add a language to get started.</div>
            ) : (
              published.map((lang: any) => (
                <div key={lang.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f5f5f5" }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{lang.name}</span>
                    <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>({lang.locale})</span>
                    {lang.isDefault && <span className="admin-badge success" style={{ marginLeft: 8 }}>Default</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!lang.isDefault && (
                      <button className="admin-btn admin-btn-sm" onClick={() => handleAction("set_default", lang.id)} title="Set as default">&#9733;</button>
                    )}
                    <Link to={`/admin/settings/languages/${lang.locale}`} className="admin-btn admin-btn-sm">Edit</Link>
                    <button className="admin-btn admin-btn-sm" onClick={() => handleAction("toggle_publish", lang.id)}>Unpublish</button>
                    {!lang.isDefault && (
                      <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleAction("delete", lang.id)}>&#128465;</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Unpublished */}
          {unpublished.length > 0 && (
            <div className="admin-card">
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Unpublished languages ({unpublished.length})</h3>
              </div>
              {unpublished.map((lang: any) => (
                <div key={lang.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f5f5f5" }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{lang.name}</span>
                    <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>({lang.locale})</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Link to={`/admin/settings/languages/${lang.locale}`} className="admin-btn admin-btn-sm">Edit</Link>
                    <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => handleAction("toggle_publish", lang.id)}>Publish</button>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleAction("delete", lang.id)}>&#128465;</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Language Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(480px, 95vw)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Add Language</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>&times;</button>
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Choose from available languages</label>
            <select className="admin-input" value={selectedLocale} onChange={(e) => setSelectedLocale(e.target.value)} style={{ width: "100%", marginBottom: 16 }}>
              <option value="">Select a language...</option>
              {availableToAdd.map((l) => (
                <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="admin-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleAdd} disabled={!selectedLocale || isLoading}>
                {isLoading ? "Adding..." : "Add Language"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
