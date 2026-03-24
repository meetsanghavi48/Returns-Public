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
import { authenticate } from "../shopify.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getAllSettings(shop);
  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const fields: Record<string, unknown> = {
    return_window_days: parseInt(formData.get("return_window_days") as string) || 30,
    exchange_window_days: parseInt(formData.get("exchange_window_days") as string) || 30,
    non_returnable_tags: (formData.get("non_returnable_tags") as string) || "",
    refund_original_payment: formData.get("refund_original_payment") === "true",
    refund_store_credit: formData.get("refund_store_credit") === "true",
    refund_exchange: formData.get("refund_exchange") === "true",
    refund_bank_transfer: formData.get("refund_bank_transfer") === "true",
    policy_text: (formData.get("policy_text") as string) || "",
  };

  for (const [key, value] of Object.entries(fields)) {
    await setSetting(shop, key, value);
  }

  return json({ saved: true });
};

export default function SettingsPolicies() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;

  const [form, setForm] = useState({
    return_window_days: String(s.return_window_days ?? 30),
    exchange_window_days: String(s.exchange_window_days ?? 30),
    non_returnable_tags: String(s.non_returnable_tags ?? ""),
    refund_original_payment: Boolean(s.refund_original_payment ?? true),
    refund_store_credit: Boolean(s.refund_store_credit ?? true),
    refund_exchange: Boolean(s.refund_exchange ?? true),
    refund_bank_transfer: Boolean(s.refund_bank_transfer ?? false),
    policy_text: String(s.policy_text ?? ""),
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
      title="Policies"
      primaryAction={
        <Button variant="primary" onClick={handleSave} loading={isLoading}>
          Save
        </Button>
      }
    >
      <BlockStack gap="400">
        {showSaved && (
          <Banner tone="success" onDismiss={() => setShowSaved(false)}>
            <p>Policy settings saved successfully.</p>
          </Banner>
        )}

        <Card>
          <FormLayout>
            <TextField
              label="Return window (days)"
              type="number"
              value={form.return_window_days}
              onChange={(v) => update("return_window_days", v)}
              autoComplete="off"
              helpText="Number of days after fulfillment during which customers can request a return."
            />
            <TextField
              label="Exchange window (days)"
              type="number"
              value={form.exchange_window_days}
              onChange={(v) => update("exchange_window_days", v)}
              autoComplete="off"
              helpText="Number of days after fulfillment during which customers can request an exchange."
            />
            <TextField
              label="Non-returnable product tags"
              value={form.non_returnable_tags}
              onChange={(v) => update("non_returnable_tags", v)}
              autoComplete="off"
              helpText="Comma-separated list of product tags that make a product non-returnable."
            />
          </FormLayout>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Allowed refund methods
            </Text>
            <Checkbox
              label="Original payment"
              checked={form.refund_original_payment}
              onChange={(v) => update("refund_original_payment", v)}
            />
            <Checkbox
              label="Store credit"
              checked={form.refund_store_credit}
              onChange={(v) => update("refund_store_credit", v)}
            />
            <Checkbox
              label="Exchange"
              checked={form.refund_exchange}
              onChange={(v) => update("refund_exchange", v)}
            />
            <Checkbox
              label="Bank transfer"
              checked={form.refund_bank_transfer}
              onChange={(v) => update("refund_bank_transfer", v)}
            />
          </BlockStack>
        </Card>

        <Card>
          <FormLayout>
            <TextField
              label="Policy text"
              value={form.policy_text}
              onChange={(v) => update("policy_text", v)}
              autoComplete="off"
              multiline={6}
              helpText="Your return/exchange policy text displayed to customers."
            />
          </FormLayout>
        </Card>
      </BlockStack>
    </Page>
  );
}
