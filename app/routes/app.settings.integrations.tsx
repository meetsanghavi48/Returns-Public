import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Tabs,
  Modal,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Button,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Grid,
  Box,
  Frame,
  Toast,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

import "~/adapters/wms/index";
import { wmsRegistry } from "~/adapters/wms/registry";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { encrypt } from "~/utils/encryption.server";

// ── Types ────────────────────────────────────────────────────────────────────

interface CredentialFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

interface WmsAdapterInfo {
  key: string;
  displayName: string;
  logoUrl: string;
  credentialFields: CredentialFieldDef[];
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
}

// ── Static provider lists ────────────────────────────────────────────────────

const CHAT_PROVIDERS = [
  { key: "limechat", name: "LimeChat", description: "WhatsApp commerce & support automation" },
  { key: "interakt", name: "Interakt", description: "Official WhatsApp Business API provider" },
  { key: "spur", name: "Spur", description: "WhatsApp marketing & support" },
  { key: "convertway", name: "Convertway", description: "WhatsApp & SMS marketing platform" },
  { key: "richpanel", name: "Richpanel", description: "AI-powered customer support" },
  { key: "freshdesk", name: "Freshdesk", description: "Multi-channel helpdesk by Freshworks" },
  { key: "zendesk", name: "Zendesk", description: "Enterprise customer service platform" },
  { key: "gorgias", name: "Gorgias", description: "Ecommerce helpdesk for Shopify" },
  { key: "wati", name: "WATI", description: "WhatsApp Team Inbox & automation" },
  { key: "zoko", name: "Zoko", description: "WhatsApp sales & support platform" },
  { key: "delightchat", name: "DelightChat", description: "Omnichannel customer support for D2C" },
];

const MOBILE_PROVIDERS = [
  { key: "plobal", name: "Plobal Apps", description: "Mobile app builder for Shopify" },
  { key: "appmaker", name: "Appmaker", description: "No-code mobile app builder" },
  { key: "magenative", name: "MageNative", description: "Shopify mobile app builder" },
  { key: "appokart", name: "AppOkart", description: "Mobile commerce app platform" },
  { key: "appbrew", name: "Appbrew", description: "High-performance mobile app builder" },
  { key: "swipecart", name: "Swipecart", description: "Mobile shopping app builder" },
  { key: "estore2app", name: "eStore2App", description: "Convert store to mobile app" },
  { key: "customer_dashboard_pro", name: "Customer Dashboard Pro", description: "Customer self-service portal" },
  { key: "hulkapps", name: "Hulk Apps", description: "Shopify app suite with mobile support" },
  { key: "tapcart", name: "Tapcart", description: "Premium mobile app builder for Shopify" },
  { key: "vajro", name: "Vajro", description: "Mobile app builder for ecommerce" },
];

const MARKETING_PROVIDERS = [
  { key: "klaviyo", name: "Klaviyo", description: "Email & SMS marketing automation" },
  { key: "yotpo", name: "Yotpo", description: "Reviews, loyalty, SMS & email marketing" },
  { key: "glood", name: "Glood", description: "AI-powered personalization & recommendations" },
  { key: "moengage", name: "MoEngage", description: "Customer engagement platform" },
  { key: "webengage", name: "WebEngage", description: "Full-stack retention & engagement" },
  { key: "omnisend", name: "Omnisend", description: "Ecommerce email & SMS marketing" },
  { key: "postscript", name: "Postscript", description: "SMS marketing for Shopify" },
];

// ── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const appUrl = process.env.SHOPIFY_APP_URL || "";

  const wmsConfigs = await prisma.wmsConfig.findMany({
    where: { shop, isActive: true },
    select: { providerKey: true, displayName: true, isDefault: true, isActive: true },
  });

  const wmsAvailable: WmsAdapterInfo[] = wmsRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    logoUrl: a.logoUrl,
    credentialFields: a.credentialFields,
  }));

  return json({ wmsAvailable, wmsConnected: wmsConfigs as ConnectedConfig[], shop, appUrl });
};

// ── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const providerKey = formData.get("providerKey") as string;

  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const displayName = formData.get("displayName") as string;
    const isDefault = formData.get("isDefault") === "true";

    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch { return json({ success: false, message: "Invalid credentials format." }); }

    try {
      const entry = wmsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown WMS provider." });
      const validationResult = await entry.adapter.validateCredentials(credentials);
      if (!validationResult.valid) return json({ success: false, message: validationResult.error || "Credential validation failed." });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Credential validation failed." });
    }

    const encryptedCredentials = encrypt(credentialsRaw);
    if (isDefault) await prisma.wmsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });

    await prisma.wmsConfig.upsert({
      where: { shop_providerKey: { shop, providerKey } },
      update: { credentials: encryptedCredentials, displayName, isDefault, isActive: true },
      create: { shop, providerKey, displayName, credentials: encryptedCredentials, isDefault, isActive: true },
    });
    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    await prisma.wmsConfig.updateMany({ where: { shop, providerKey }, data: { isActive: false } });
    return json({ success: true, message: "Provider disconnected." });
  }

  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;
    let credentials: Record<string, string>;
    try { credentials = JSON.parse(credentialsRaw); } catch { return json({ success: false, message: "Invalid credentials format." }); }
    try {
      const entry = wmsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown WMS provider." });
      const result = await entry.adapter.validateCredentials(credentials);
      return json({ success: result.valid, message: result.valid ? "Credentials validated successfully." : (result.error || "Validation failed.") });
    } catch (err: unknown) {
      return json({ success: false, message: err instanceof Error ? err.message : "Connection test failed." });
    }
  }

  if (intent === "set_default") {
    await prisma.wmsConfig.updateMany({ where: { shop, isDefault: true }, data: { isDefault: false } });
    await prisma.wmsConfig.updateMany({ where: { shop, providerKey }, data: { isDefault: true } });
    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

// ── Component ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "chat", content: "Chat / WhatsApp" },
  { id: "mobile", content: "Mobile Apps" },
  { id: "marketing", content: "Marketing / CRM" },
  { id: "wms", content: "WMS" },
];

export default function SettingsIntegrations() {
  const { wmsAvailable, wmsConnected, appUrl } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  const showToast = useCallback((message: string, isError = false) => {
    setToastMessage(message);
    setToastError(isError);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage("");
    setToastError(false);
  }, []);

  return (
    <Frame>
      <Page
        backAction={{ content: "Settings", url: "/app/settings" }}
        title="Integrations"
        subtitle="Connect with chat, mobile, marketing, and WMS platforms"
      >
        <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
          <Box paddingBlockStart="400">
            {selectedTab === 0 && <ChatTab appUrl={appUrl} />}
            {selectedTab === 1 && <MobileTab appUrl={appUrl} />}
            {selectedTab === 2 && <MarketingTab appUrl={appUrl} />}
            {selectedTab === 3 && (
              <WmsProviderList
                adapters={wmsAvailable as WmsAdapterInfo[]}
                connected={wmsConnected as ConnectedConfig[]}
                showToast={showToast}
              />
            )}
          </Box>
        </Tabs>

        {toastMessage && (
          <Toast content={toastMessage} error={toastError} onDismiss={dismissToast} duration={4000} />
        )}
      </Page>
    </Frame>
  );
}

// ── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({ appUrl }: { appUrl: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const baseUrl = appUrl || "https://returns-public.onrender.com";

  const copyWebhook = useCallback((key: string) => {
    navigator.clipboard.writeText(`${baseUrl}/api/webhooks/chat/${key}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, [baseUrl]);

  return (
    <Grid>
      {CHAT_PROVIDERS.map((provider) => (
        <Grid.Cell key={provider.key} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">{provider.name}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{provider.description}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Webhook: <code style={{ fontSize: 11 }}>/api/webhooks/chat/{provider.key}</code>
              </Text>
              <Button size="slim" onClick={() => copyWebhook(provider.key)}>
                {copiedKey === provider.key ? "Copied!" : "Copy Webhook URL"}
              </Button>
            </BlockStack>
          </Card>
        </Grid.Cell>
      ))}
    </Grid>
  );
}

// ── Mobile Tab ───────────────────────────────────────────────────────────────

function MobileTab({ appUrl }: { appUrl: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const baseUrl = appUrl || "https://returns-public.onrender.com";

  const copyEmbed = useCallback((key: string) => {
    navigator.clipboard.writeText(`${baseUrl}/api/mobile/${key}?shop=YOUR_SHOP.myshopify.com`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, [baseUrl]);

  return (
    <Grid>
      {MOBILE_PROVIDERS.map((provider) => (
        <Grid.Cell key={provider.key} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">{provider.name}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{provider.description}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Endpoint: <code style={{ fontSize: 11 }}>/api/mobile/{provider.key}</code>
              </Text>
              <Button size="slim" onClick={() => copyEmbed(provider.key)}>
                {copiedKey === provider.key ? "Copied!" : "Copy Embed URL"}
              </Button>
            </BlockStack>
          </Card>
        </Grid.Cell>
      ))}
    </Grid>
  );
}

// ── Marketing Tab ────────────────────────────────────────────────────────────

function MarketingTab({ appUrl }: { appUrl: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const baseUrl = appUrl || "https://returns-public.onrender.com";

  const copyEndpoint = useCallback((key: string) => {
    navigator.clipboard.writeText(`${baseUrl}/api/events/${key}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, [baseUrl]);

  return (
    <Grid>
      {MARKETING_PROVIDERS.map((provider) => (
        <Grid.Cell key={provider.key} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">{provider.name}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{provider.description}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Event endpoint: <code style={{ fontSize: 11 }}>/api/events/{provider.key}</code>
              </Text>
              <Button size="slim" onClick={() => copyEndpoint(provider.key)}>
                {copiedKey === provider.key ? "Copied!" : "Copy Event URL"}
              </Button>
            </BlockStack>
          </Card>
        </Grid.Cell>
      ))}
    </Grid>
  );
}

// ── WMS Provider List ────────────────────────────────────────────────────────

interface WmsProviderListProps {
  adapters: WmsAdapterInfo[];
  connected: ConnectedConfig[];
  showToast: (message: string, isError?: boolean) => void;
}

function WmsProviderList({ adapters, connected, showToast }: WmsProviderListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<WmsAdapterInfo | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "critical"; message: string } | null>(null);

  const connectFetcher = useFetcher<{ success: boolean; message: string }>();
  const testFetcher = useFetcher<{ success: boolean; message: string }>();
  const disconnectFetcher = useFetcher<{ success: boolean; message: string }>();
  const defaultFetcher = useFetcher<{ success: boolean; message: string }>();

  const connectedMap = new Map(connected.map((c) => [c.providerKey, c]));

  const openModal = useCallback((adapter: WmsAdapterInfo) => {
    setSelectedAdapter(adapter);
    setCredentialValues({});
    setSetAsDefault(false);
    setFeedback(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedAdapter(null);
    setCredentialValues({});
    setFeedback(null);
  }, []);

  const updateCredential = useCallback((key: string, value: string) => {
    setCredentialValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (connectFetcher.data) {
      if (connectFetcher.data.success) { showToast(connectFetcher.data.message); closeModal(); }
      else setFeedback({ type: "critical", message: connectFetcher.data.message });
    }
  }, [connectFetcher.data, showToast, closeModal]);

  useEffect(() => {
    if (testFetcher.data) {
      setFeedback({ type: testFetcher.data.success ? "success" : "critical", message: testFetcher.data.message });
    }
  }, [testFetcher.data]);

  useEffect(() => {
    if (disconnectFetcher.data) showToast(disconnectFetcher.data.message, !disconnectFetcher.data.success);
  }, [disconnectFetcher.data, showToast]);

  useEffect(() => {
    if (defaultFetcher.data) showToast(defaultFetcher.data.message, !defaultFetcher.data.success);
  }, [defaultFetcher.data, showToast]);

  const handleTestConnection = useCallback(() => {
    if (!selectedAdapter) return;
    const fd = new FormData();
    fd.set("intent", "test");
    fd.set("providerKey", selectedAdapter.key);
    fd.set("credentials", JSON.stringify(credentialValues));
    testFetcher.submit(fd, { method: "post" });
  }, [selectedAdapter, credentialValues, testFetcher]);

  const handleConnect = useCallback(() => {
    if (!selectedAdapter) return;
    for (const field of selectedAdapter.credentialFields) {
      if (field.required && !credentialValues[field.key]?.trim()) {
        setFeedback({ type: "critical", message: `${field.label} is required.` });
        return;
      }
    }
    const fd = new FormData();
    fd.set("intent", "connect");
    fd.set("providerKey", selectedAdapter.key);
    fd.set("displayName", selectedAdapter.displayName);
    fd.set("credentials", JSON.stringify(credentialValues));
    fd.set("isDefault", String(setAsDefault));
    connectFetcher.submit(fd, { method: "post" });
  }, [selectedAdapter, credentialValues, setAsDefault, connectFetcher]);

  const handleDisconnect = useCallback((providerKey: string) => {
    const fd = new FormData();
    fd.set("intent", "disconnect");
    fd.set("providerKey", providerKey);
    disconnectFetcher.submit(fd, { method: "post" });
  }, [disconnectFetcher]);

  const handleSetDefault = useCallback((providerKey: string) => {
    const fd = new FormData();
    fd.set("intent", "set_default");
    fd.set("providerKey", providerKey);
    defaultFetcher.submit(fd, { method: "post" });
  }, [defaultFetcher]);

  return (
    <>
      {adapters.length === 0 ? (
        <Card>
          <Text as="p" variant="bodyMd" tone="subdued">No WMS adapters are registered.</Text>
        </Card>
      ) : (
        <Grid>
          {adapters.map((adapter) => {
            const config = connectedMap.get(adapter.key);
            const isConnected = !!config;
            const isDefault = config?.isDefault ?? false;

            return (
              <Grid.Cell key={adapter.key} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Text as="h3" variant="headingMd">{adapter.displayName}</Text>
                      <Badge tone={isConnected ? "success" : undefined}>
                        {isConnected ? "Connected" : "Not connected"}
                      </Badge>
                    </InlineStack>
                    {isConnected && isDefault && <Badge tone="info">Default</Badge>}
                    <InlineStack gap="200">
                      <Button onClick={() => openModal(adapter)}>
                        {isConnected ? "Manage" : "Connect"}
                      </Button>
                      {isConnected && !isDefault && (
                        <Button onClick={() => handleSetDefault(adapter.key)}>Set as Default</Button>
                      )}
                      {isConnected && (
                        <Button tone="critical" onClick={() => handleDisconnect(adapter.key)}>Disconnect</Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            );
          })}
        </Grid>
      )}

      {selectedAdapter && (
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={`Connect ${selectedAdapter.displayName}`}
          primaryAction={{
            content: "Save",
            onAction: handleConnect,
            loading: connectFetcher.state !== "idle",
            disabled: connectFetcher.state !== "idle",
          }}
          secondaryActions={[{
            content: "Test Connection",
            onAction: handleTestConnection,
            loading: testFetcher.state !== "idle",
            disabled: testFetcher.state !== "idle",
          }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {feedback && (
                <Banner title={feedback.type === "success" ? "Success" : "Error"} tone={feedback.type} onDismiss={() => setFeedback(null)}>
                  <p>{feedback.message}</p>
                </Banner>
              )}
              <FormLayout>
                {selectedAdapter.credentialFields.map((field) => {
                  if (field.type === "select" && field.options) {
                    return (
                      <Select key={field.key} label={field.label} options={field.options}
                        value={credentialValues[field.key] || ""} onChange={(val) => updateCredential(field.key, val)}
                        helpText={field.helpText} requiredIndicator={field.required} />
                    );
                  }
                  return (
                    <TextField key={field.key} label={field.label} type={field.type === "password" ? "password" : "text"}
                      value={credentialValues[field.key] || ""} onChange={(val) => updateCredential(field.key, val)}
                      placeholder={field.placeholder} helpText={field.helpText} autoComplete="off" requiredIndicator={field.required} />
                  );
                })}
                <Checkbox label="Set as default provider" checked={setAsDefault} onChange={setSetAsDefault}
                  helpText="When enabled, this WMS provider will be used by default for new operations." />
              </FormLayout>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
}
