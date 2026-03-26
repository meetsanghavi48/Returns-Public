import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useOutletContext } from "@remix-run/react";
import prisma from "../db.server";
import { getSetting } from "../services/settings.server";
import { shopifyREST } from "../services/shopify.server";
import portalStyles from "../styles/portal.css?url";

export const links = () => [
  { rel: "stylesheet", href: portalStyles },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap",
  },
];

async function getThemeColors(shop: string, accessToken: string) {
  try {
    const themesRes = await shopifyREST(shop, accessToken, "GET", "/themes.json");
    const activeTheme = (themesRes?.themes || []).find((t: any) => t.role === "main");
    if (!activeTheme) return null;

    const settingsRes = await shopifyREST(shop, accessToken, "GET",
      `/themes/${activeTheme.id}/assets.json?asset[key]=config/settings_data.json`);
    let settings: any = {};
    try { settings = JSON.parse(settingsRes?.asset?.value || "{}"); } catch { return null; }
    const current = settings?.current || {};

    const bgColor =
      current["color_background"] ||
      current["colors_background_1"] ||
      current["background"] ||
      current["page_background"] ||
      null;
    const textColor =
      current["color_text"] ||
      current["colors_text"] ||
      current["text"] ||
      null;
    const borderColor =
      current["color_border"] ||
      current["colors_border"] ||
      null;

    return { bgColor, textColor, borderColor };
  } catch {
    return null;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const shopDomain = params.shop;
  if (!shopDomain) throw new Response("Shop not found", { status: 404 });

  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
  });

  if (!shopRecord || shopRecord.uninstalledAt) {
    throw new Response("This store has not installed the Returns Manager app.", {
      status: 404,
    });
  }

  // Load branding settings
  const buttonColor = await getSetting<string>(shopDomain, "portal_button_color", "#C84B31");
  const bannerUrl = await getSetting<string>(shopDomain, "portal_banner_url", "");

  // Fetch theme colors (leave null if brand color is manually set)
  let themeColors: { bgColor: string | null; textColor: string | null; borderColor: string | null } | null = null;
  try {
    themeColors = await getThemeColors(shopDomain, shopRecord.accessToken);
  } catch { /* skip theme fetch errors */ }

  // Language detection from Accept-Language header
  let translations: Record<string, string> = {};
  try {
    const acceptLang = request.headers.get("Accept-Language") || "en";
    const preferredLocale = acceptLang.split(",")[0].split("-")[0].trim();

    if (preferredLocale !== "en") {
      const language = await prisma.language.findFirst({
        where: { shop: shopDomain, locale: preferredLocale, isPublished: true },
      });
      if (language) {
        translations = (language.translations || {}) as Record<string, string>;
      }
    }
  } catch {}

  return json({ shop: shopDomain, buttonColor, bannerUrl, translations, themeColors });
};

// Darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
}

export default function PortalLayout() {
  const { shop, buttonColor, bannerUrl, translations, themeColors } = useLoaderData<typeof loader>();

  const accentHover = darkenColor(buttonColor, 10);

  // Apply theme colors if available
  const themeBg = themeColors?.bgColor || null;
  const themeText = themeColors?.textColor || null;
  const themeBorder = themeColors?.borderColor || null;

  const cssVars: Record<string, string> = {
    "--portal-accent": buttonColor,
    "--portal-accent-hover": accentHover,
  };
  if (themeBg) cssVars["--portal-bg"] = themeBg;
  if (themeText) cssVars["--portal-text"] = themeText;
  if (themeBorder) cssVars["--portal-border"] = themeBorder;

  // Client-side fallback script to read Shopify CSS variables
  const themeColorScript = `(function(){
    var s=getComputedStyle(document.documentElement);
    var bg=s.getPropertyValue('--color-background').trim()||s.getPropertyValue('--color-base-background-1').trim();
    var text=s.getPropertyValue('--color-foreground').trim()||s.getPropertyValue('--color-base-text').trim();
    var accent=s.getPropertyValue('--color-button').trim()||s.getPropertyValue('--color-accent-1').trim();
    if(bg){document.documentElement.style.setProperty('--portal-bg',bg);document.body.style.backgroundColor=bg;}
    if(text)document.documentElement.style.setProperty('--portal-text',text);
    if(accent)document.documentElement.style.setProperty('--portal-accent',accent);
  })()`;

  return (
    <div
      className="portal-wrapper"
      style={cssVars as React.CSSProperties}
    >
      <script dangerouslySetInnerHTML={{ __html: themeColorScript }} />

      {bannerUrl ? (
        <>
          <div className="portal-hero">
            <div className="portal-hero-banner">
              <img src={bannerUrl} alt="Store Banner" className="portal-banner-img" />
            </div>
            <div className="portal-hero-content">
              <h1 className="portal-logo">{translations?.portal_title || "Returns & Exchanges"}</h1>
              <main className="portal-main portal-main-hero">
                <Outlet context={{ translations }} />
              </main>
            </div>
          </div>
        </>
      ) : (
        <>
          <header className="portal-header">
            <h1 className="portal-logo">{translations?.portal_title || "Returns Portal"}</h1>
          </header>
          <main className="portal-main">
            <Outlet context={{ translations }} />
          </main>
        </>
      )}
      <footer className="portal-footer">
        <p>Powered by Returns Manager</p>
      </footer>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="portal-wrapper">
      <div className="portal-main">
        <div className="portal-card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <h2>Store Not Found</h2>
          <p>This returns portal is not available. The store may not have installed the app.</p>
        </div>
      </div>
    </div>
  );
}
