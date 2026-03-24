import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getAllSettings(shop);
  return json({ settings, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const fields: Record<string, unknown> = {
    brand_name: (formData.get("brand_name") as string) || "",
    brand_logo_url: (formData.get("brand_logo_url") as string) || "",
    brand_color: (formData.get("brand_color") as string) || "#000000",
    portal_slug: (formData.get("portal_slug") as string) || "returns",
    return_window_days: parseInt(formData.get("return_window_days") as string) || 30,
    auto_approve: formData.get("auto_approve") === "true",
    require_photos: formData.get("require_photos") === "true",
    ineligible_order_tags: (formData.get("ineligible_order_tags") as string) || "",
  };

  for (const [key, value] of Object.entries(fields)) {
    await setSetting(shop, key, value);
  }

  return json({ saved: true });
};

export default function SettingsGeneral() {
  const { settings, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;

  const [form, setForm] = useState({
    brand_name: String(s.brand_name ?? ""),
    brand_logo_url: String(s.brand_logo_url ?? ""),
    brand_color: String(s.brand_color ?? "#000000"),
    portal_slug: String(s.portal_slug ?? "returns"),
    return_window_days: String(s.return_window_days ?? 30),
    auto_approve: Boolean(s.auto_approve ?? false),
    require_photos: Boolean(s.require_photos ?? false),
    ineligible_order_tags: String(s.ineligible_order_tags ?? ""),
  });

  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (actionData?.saved) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [actionData]);

  const update = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    const formData = new FormData();
    for (const [k, v] of Object.entries(form)) {
      formData.set(k, String(v));
    }
    submit(formData, { method: "post" });
  };

  return (
    <Page
      backAction={{ content: "Settings", url: "/app/settings" }}
      title="General Settings"
      primaryAction={
        <Button variant="primary" onClick={handleSave} loading={isLoading}>
          Save
        </Button>
      }
    >
      <BlockStack gap="400">
        {showSaved && (
          <Banner tone="success" onDismiss={() => setShowSaved(false)}>
            <p>Settings saved successfully.</p>
          </Banner>
        )}

        <Card>
          <FormLayout>
            <TextField
              label="Brand name"
              value={form.brand_name}
              onChange={(v) => update("brand_name", v)}
              autoComplete="off"
              helpText="Your brand name displayed on the return portal."
            />
            <TextField
              label="Brand logo URL"
              value={form.brand_logo_url}
              onChange={(v) => update("brand_logo_url", v)}
              autoComplete="off"
              helpText="Full URL to your brand logo image."
            />
            <TextField
              label="Brand color"
              value={form.brand_color}
              onChange={(v) => update("brand_color", v)}
              autoComplete="off"
              helpText="Primary brand color (hex code)."
              prefix={
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    backgroundColor: form.brand_color,
                    border: "1px solid #ccc",
                  }}
                />
              }
            />
            <TextField
              label="Portal slug"
              value={form.portal_slug}
              onChange={(v) => update("portal_slug", v)}
              autoComplete="off"
              helpText={`Full URL: https://${shop}/apps/${form.portal_slug || "returns"}`}
            />
            <TextField
              label="Return window (days)"
              type="number"
              value={form.return_window_days}
              onChange={(v) => update("return_window_days", v)}
              autoComplete="off"
              helpText="Number of days after fulfillment during which customers can request a return."
            />
            <Checkbox
              label="Auto approve return requests"
              checked={form.auto_approve}
              onChange={(v) => update("auto_approve", v)}
              helpText="When enabled, return requests are automatically approved on submission."
            />
            <Checkbox
              label="Require photos"
              checked={form.require_photos}
              onChange={(v) => update("require_photos", v)}
              helpText="When enabled, customers must upload photos when submitting a return request."
            />
            <TextField
              label="Ineligible order tags"
              value={form.ineligible_order_tags}
              onChange={(v) => update("ineligible_order_tags", v)}
              autoComplete="off"
              helpText="Comma-separated list of order tags that make an order ineligible for returns."
            />
          </FormLayout>
        </Card>
      </BlockStack>
    </Page>
  );
}
