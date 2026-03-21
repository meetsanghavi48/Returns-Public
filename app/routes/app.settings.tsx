import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  Divider,
  Checkbox,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAllSettings, setSetting } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await getAllSettings(shop);
  const shopConfig = await prisma.shop.findUnique({ where: { shop } });

  return json({ settings, shopConfig, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  // Save settings
  const settingsMap: Record<string, unknown> = {
    return_window_days: parseInt(formData.get("return_window_days") as string) || 30,
    restocking_fee_pct: parseFloat(formData.get("restocking_fee_pct") as string) || 0,
    return_shipping_fee: parseFloat(formData.get("return_shipping_fee") as string) || 100,
    auto_approve: formData.get("auto_approve") === "true",
  };

  for (const [key, value] of Object.entries(settingsMap)) {
    await setSetting(shop, key, value);
  }

  // Save shop-level config (Delhivery, Easebuzz, Warehouse)
  await prisma.shop.update({
    where: { shop },
    data: {
      delhiveryToken: (formData.get("delhivery_token") as string) || null,
      delhiveryWarehouse: (formData.get("delhivery_warehouse") as string) || null,
      easebuzzKey: (formData.get("easebuzz_key") as string) || null,
      easebuzzSalt: (formData.get("easebuzz_salt") as string) || null,
      easebuzzMid: (formData.get("easebuzz_mid") as string) || null,
      easebuzzEnv: (formData.get("easebuzz_env") as string) || "test",
      warehouseName: (formData.get("warehouse_name") as string) || null,
      warehouseAddress: (formData.get("warehouse_address") as string) || null,
      warehouseCity: (formData.get("warehouse_city") as string) || null,
      warehouseState: (formData.get("warehouse_state") as string) || null,
      warehousePincode: (formData.get("warehouse_pincode") as string) || null,
      warehousePhone: (formData.get("warehouse_phone") as string) || null,
    },
  });

  return json({ saved: true });
};

export default function Settings() {
  const { settings, shopConfig, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const s = settings as Record<string, any>;
  const sc = shopConfig as any;

  const [form, setForm] = useState({
    return_window_days: String(s.return_window_days ?? 30),
    restocking_fee_pct: String(s.restocking_fee_pct ?? 0),
    return_shipping_fee: String(s.return_shipping_fee ?? 100),
    auto_approve: Boolean(s.auto_approve ?? true),
    delhivery_token: sc?.delhiveryToken || "",
    delhivery_warehouse: sc?.delhiveryWarehouse || "",
    easebuzz_key: sc?.easebuzzKey || "",
    easebuzz_salt: sc?.easebuzzSalt || "",
    easebuzz_mid: sc?.easebuzzMid || "",
    easebuzz_env: sc?.easebuzzEnv || "test",
    warehouse_name: sc?.warehouseName || "",
    warehouse_address: sc?.warehouseAddress || "",
    warehouse_city: sc?.warehouseCity || "",
    warehouse_state: sc?.warehouseState || "",
    warehouse_pincode: sc?.warehousePincode || "",
    warehouse_phone: sc?.warehousePhone || "",
  });

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
      title="Settings"
      primaryAction={
        <Button variant="primary" onClick={handleSave} loading={isLoading}>
          Save
        </Button>
      }
    >
      <Layout>
        <Layout.AnnotatedSection
          title="Return Policy"
          description="Configure your return window, fees, and auto-approval."
        >
          <Card>
            <FormLayout>
              <TextField
                label="Return Window (days)"
                type="number"
                value={form.return_window_days}
                onChange={(v) => update("return_window_days", v)}
                helpText="Number of days after order fulfillment during which customers can request a return."
                autoComplete="off"
              />
              <TextField
                label="Restocking Fee (%)"
                type="number"
                value={form.restocking_fee_pct}
                onChange={(v) => update("restocking_fee_pct", v)}
                helpText="Percentage deducted from refund amount. Set to 0 for no fee."
                autoComplete="off"
              />
              <TextField
                label="Return Shipping Fee (₹)"
                type="number"
                value={form.return_shipping_fee}
                onChange={(v) => update("return_shipping_fee", v)}
                helpText="Flat fee deducted from original payment refunds. Not applied to store credit."
                autoComplete="off"
              />
              <Checkbox
                label="Auto-approve return requests"
                checked={form.auto_approve}
                onChange={(v) => update("auto_approve", v)}
                helpText="When enabled, customer return requests are automatically approved on submission."
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Warehouse"
          description="Your warehouse/pickup address for Delhivery pickups."
        >
          <Card>
            <FormLayout>
              <TextField label="Name" value={form.warehouse_name} onChange={(v) => update("warehouse_name", v)} autoComplete="off" />
              <TextField label="Address" value={form.warehouse_address} onChange={(v) => update("warehouse_address", v)} autoComplete="off" multiline={2} />
              <FormLayout.Group>
                <TextField label="City" value={form.warehouse_city} onChange={(v) => update("warehouse_city", v)} autoComplete="off" />
                <TextField label="State" value={form.warehouse_state} onChange={(v) => update("warehouse_state", v)} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField label="Pincode" value={form.warehouse_pincode} onChange={(v) => update("warehouse_pincode", v)} autoComplete="off" />
                <TextField label="Phone" value={form.warehouse_phone} onChange={(v) => update("warehouse_phone", v)} autoComplete="off" />
              </FormLayout.Group>
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Delhivery"
          description="Configure your Delhivery logistics integration."
        >
          <Card>
            <FormLayout>
              <TextField
                label="API Token"
                value={form.delhivery_token}
                onChange={(v) => update("delhivery_token", v)}
                type="password"
                autoComplete="off"
              />
              <TextField
                label="Warehouse Name (in Delhivery)"
                value={form.delhivery_warehouse}
                onChange={(v) => update("delhivery_warehouse", v)}
                autoComplete="off"
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Easebuzz Payments"
          description="Configure Easebuzz for exchange price difference payments."
        >
          <Card>
            <FormLayout>
              <TextField label="Key" value={form.easebuzz_key} onChange={(v) => update("easebuzz_key", v)} autoComplete="off" />
              <TextField label="Salt" value={form.easebuzz_salt} onChange={(v) => update("easebuzz_salt", v)} type="password" autoComplete="off" />
              <TextField label="Merchant ID" value={form.easebuzz_mid} onChange={(v) => update("easebuzz_mid", v)} autoComplete="off" />
              <Select
                label="Environment"
                options={[
                  { label: "Test", value: "test" },
                  { label: "Production", value: "prod" },
                ]}
                value={form.easebuzz_env}
                onChange={(v) => update("easebuzz_env", v)}
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Customer Portal"
          description="Your customer-facing returns portal URL."
        >
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                Share this URL with your customers:
              </Text>
              <Text as="p" variant="bodyMd" fontWeight="bold">
                {`${typeof window !== "undefined" ? window.location.origin : "[your-app-url]"}/portal/${shop}`}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                You can also use the Shopify App Proxy (apps/returns) to serve this under your store domain.
              </Text>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
