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
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { requireAdminAuth } from "../services/admin-session.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, accessToken } = await requireAdminAuth(request);
  
  const settings = await getAllSettings(shop);
  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, accessToken } = await requireAdminAuth(request);
  
  const formData = await request.formData();

  const fields: Record<string, unknown> = {
    notify_customer_email: formData.get("notify_customer_email") === "true",
    notify_merchant_email: formData.get("notify_merchant_email") === "true",
    notify_whatsapp: formData.get("notify_whatsapp") === "true",
    merchant_email: (formData.get("merchant_email") as string) || "",
    sendgrid_api_key: (formData.get("sendgrid_api_key") as string) || "",
  };

  for (const [key, value] of Object.entries(fields)) {
    await setSetting(shop, key, value);
  }

  return json({ saved: true });
};

export default function SettingsNotifications() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;

  const [form, setForm] = useState({
    notify_customer_email: Boolean(s.notify_customer_email ?? true),
    notify_merchant_email: Boolean(s.notify_merchant_email ?? true),
    notify_whatsapp: Boolean(s.notify_whatsapp ?? false),
    merchant_email: String(s.merchant_email ?? ""),
    sendgrid_api_key: String(s.sendgrid_api_key ?? ""),
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

  // Mask API key for display
  const maskedApiKey =
    form.sendgrid_api_key.length > 8
      ? form.sendgrid_api_key.slice(0, 4) + "..." + form.sendgrid_api_key.slice(-4)
      : form.sendgrid_api_key;

  return (
    <Page
      backAction={{ content: "Settings", url: "/admin/settings" }}
      title="Notifications"
      primaryAction={
        <Button variant="primary" onClick={handleSave} loading={isLoading}>
          Save
        </Button>
      }
    >
      <BlockStack gap="400">
        {showSaved && (
          <Banner tone="success" onDismiss={() => setShowSaved(false)}>
            <p>Notification settings saved successfully.</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Notification channels
            </Text>
            <Checkbox
              label="Email notifications to customer"
              checked={form.notify_customer_email}
              onChange={(v) => update("notify_customer_email", v)}
              helpText="Send email notifications to customers about their return status updates."
            />
            <Checkbox
              label="Email notifications to merchant"
              checked={form.notify_merchant_email}
              onChange={(v) => update("notify_merchant_email", v)}
              helpText="Receive email notifications when customers submit or update return requests."
            />
            <Checkbox
              label="WhatsApp notifications"
              checked={form.notify_whatsapp}
              onChange={(v) => update("notify_whatsapp", v)}
              helpText="Send WhatsApp notifications to customers (requires WhatsApp Business API integration)."
            />
          </BlockStack>
        </Card>

        <Card>
          <FormLayout>
            <TextField
              label="Merchant email"
              value={form.merchant_email}
              onChange={(v) => update("merchant_email", v)}
              autoComplete="email"
              type="email"
              helpText="Email address where merchant notifications will be sent."
            />
            <TextField
              label="SendGrid API key"
              value={form.sendgrid_api_key}
              onChange={(v) => update("sendgrid_api_key", v)}
              autoComplete="off"
              type="password"
              helpText={
                form.sendgrid_api_key
                  ? `Current key: ${maskedApiKey}`
                  : "Enter your SendGrid API key for sending transactional emails."
              }
            />
          </FormLayout>
        </Card>
      </BlockStack>
    </Page>
  );
}
