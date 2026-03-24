import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
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
  Toast,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Grid,
  Frame,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

import "~/adapters/logistics/index";
import "~/adapters/payments/index";
import "~/adapters/wms/index";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { paymentRegistry } from "~/adapters/payments/registry";
import { wmsRegistry } from "~/adapters/wms/registry";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { encrypt, decrypt } from "~/utils/encryption.server";

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

interface AdapterInfo {
  key: string;
  displayName: string;
  region: string;
  logoUrl: string;
  credentialFields: CredentialFieldDef[];
  supportsRefund?: boolean;
  supportsStoreCredit?: boolean;
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  region?: string;
}

interface CategoryData {
  available: AdapterInfo[];
  connected: ConnectedConfig[];
}

interface LoaderData {
  logistics: CategoryData;
  payments: CategoryData;
  wms: CategoryData;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [logisticsConfigs, paymentConfigs, wmsConfigs] = await Promise.all([
    prisma.logisticsConfig.findMany({
      where: { shop, isActive: true },
      select: {
        providerKey: true,
        displayName: true,
        isDefault: true,
        isActive: true,
        region: true,
      },
    }),
    prisma.paymentConfig.findMany({
      where: { shop, isActive: true },
      select: {
        providerKey: true,
        displayName: true,
        isDefault: true,
        isActive: true,
      },
    }),
    prisma.wmsConfig.findMany({
      where: { shop, isActive: true },
      select: {
        providerKey: true,
        displayName: true,
        isDefault: true,
        isActive: true,
      },
    }),
  ]);

  const logisticsAvailable: AdapterInfo[] = logisticsRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    region: a.region,
    logoUrl: a.logoUrl,
    credentialFields: a.credentialFields,
  }));

  const paymentsAvailable: AdapterInfo[] = paymentRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    region: "global",
    logoUrl: a.logoUrl,
    credentialFields: a.credentialFields,
    supportsRefund: a.supportsRefund,
    supportsStoreCredit: a.supportsStoreCredit,
  }));

  const wmsAvailable: AdapterInfo[] = wmsRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    region: "global",
    logoUrl: a.logoUrl,
    credentialFields: a.credentialFields,
  }));

  return json<LoaderData>({
    logistics: {
      available: logisticsAvailable,
      connected: logisticsConfigs,
    },
    payments: {
      available: paymentsAvailable,
      connected: paymentConfigs.map((c) => ({ ...c, region: undefined })),
    },
    wms: {
      available: wmsAvailable,
      connected: wmsConfigs.map((c) => ({ ...c, region: undefined })),
    },
  });
};

// ── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const category = formData.get("category") as string; // logistics | payments | wms
  const providerKey = formData.get("providerKey") as string;

  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const displayName = formData.get("displayName") as string;
    const isDefault = formData.get("isDefault") === "true";
    const region = (formData.get("region") as string) || "global";

    // Validate credentials before saving
    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }

    try {
      let validationResult: { valid: boolean; error?: string } = { valid: false, error: "Unknown category" };
      if (category === "logistics") {
        const entry = logisticsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown logistics provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      } else if (category === "payments") {
        const entry = paymentRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown payment provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      } else if (category === "wms") {
        const entry = wmsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown WMS provider." });
        validationResult = await entry.adapter.validateCredentials(credentials);
      }

      if (!validationResult.valid) {
        return json({ success: false, message: validationResult.error || "Credential validation failed." });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Credential validation failed.";
      return json({ success: false, message: errorMessage });
    }

    const encryptedCredentials = encrypt(credentialsRaw);

    // If setting as default, unset other defaults in this category
    if (isDefault) {
      if (category === "logistics") {
        await prisma.logisticsConfig.updateMany({
          where: { shop, isDefault: true },
          data: { isDefault: false },
        });
      } else if (category === "payments") {
        await prisma.paymentConfig.updateMany({
          where: { shop, isDefault: true },
          data: { isDefault: false },
        });
      } else if (category === "wms") {
        await prisma.wmsConfig.updateMany({
          where: { shop, isDefault: true },
          data: { isDefault: false },
        });
      }
    }

    if (category === "logistics") {
      await prisma.logisticsConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: {
          credentials: encryptedCredentials,
          displayName,
          isDefault,
          isActive: true,
          region,
        },
        create: {
          shop,
          providerKey,
          displayName,
          credentials: encryptedCredentials,
          isDefault,
          isActive: true,
          region,
        },
      });
    } else if (category === "payments") {
      await prisma.paymentConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: {
          credentials: encryptedCredentials,
          displayName,
          isDefault,
          isActive: true,
        },
        create: {
          shop,
          providerKey,
          displayName,
          credentials: encryptedCredentials,
          isDefault,
          isActive: true,
        },
      });
    } else if (category === "wms") {
      await prisma.wmsConfig.upsert({
        where: { shop_providerKey: { shop, providerKey } },
        update: {
          credentials: encryptedCredentials,
          displayName,
          isDefault,
          isActive: true,
        },
        create: {
          shop,
          providerKey,
          displayName,
          credentials: encryptedCredentials,
          isDefault,
          isActive: true,
        },
      });
    }

    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    if (category === "logistics") {
      await prisma.logisticsConfig.updateMany({
        where: { shop, providerKey },
        data: { isActive: false },
      });
    } else if (category === "payments") {
      await prisma.paymentConfig.updateMany({
        where: { shop, providerKey },
        data: { isActive: false },
      });
    } else if (category === "wms") {
      await prisma.wmsConfig.updateMany({
        where: { shop, providerKey },
        data: { isActive: false },
      });
    }

    return json({ success: true, message: "Provider disconnected." });
  }

  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;
    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }

    try {
      let result: { valid: boolean; error?: string };

      if (category === "logistics") {
        const entry = logisticsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown logistics provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else if (category === "payments") {
        const entry = paymentRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown payment provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else if (category === "wms") {
        const entry = wmsRegistry.get(providerKey);
        if (!entry) return json({ success: false, message: "Unknown WMS provider." });
        result = await entry.adapter.validateCredentials(credentials);
      } else {
        return json({ success: false, message: "Unknown category." });
      }

      if (result.valid) {
        return json({ success: true, message: "Credentials validated successfully." });
      } else {
        return json({ success: false, message: result.error || "Validation failed." });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Connection test failed.";
      return json({ success: false, message: errorMessage });
    }
  }

  if (intent === "set_default") {
    if (category === "logistics") {
      await prisma.logisticsConfig.updateMany({
        where: { shop, isDefault: true },
        data: { isDefault: false },
      });
      await prisma.logisticsConfig.updateMany({
        where: { shop, providerKey },
        data: { isDefault: true },
      });
    } else if (category === "payments") {
      await prisma.paymentConfig.updateMany({
        where: { shop, isDefault: true },
        data: { isDefault: false },
      });
      await prisma.paymentConfig.updateMany({
        where: { shop, providerKey },
        data: { isDefault: true },
      });
    } else if (category === "wms") {
      await prisma.wmsConfig.updateMany({
        where: { shop, isDefault: true },
        data: { isDefault: false },
      });
      await prisma.wmsConfig.updateMany({
        where: { shop, providerKey },
        data: { isDefault: true },
      });
    }

    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

// ── Component ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "logistics", content: "Logistics" },
  { id: "payments", content: "Payments" },
  { id: "wms", content: "WMS" },
  { id: "chat", content: "Chat" },
  { id: "mobile", content: "Mobile" },
  { id: "marketing", content: "Marketing & CRM" },
];

export default function IntegrationsPage() {
  const data = useLoaderData<typeof loader>() as LoaderData;
  const [selectedTab, setSelectedTab] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
  }, []);

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
        title="Integrations"
        subtitle="Connect your logistics, payment, and WMS providers"
      >
        <Layout>
          <Layout.Section>
            <Tabs tabs={TABS} selected={selectedTab} onSelect={handleTabChange}>
              <Box paddingBlockStart="400">
                {selectedTab === 0 && (
                  <ProviderTab
                    category="logistics"
                    adapters={data.logistics.available}
                    connected={data.logistics.connected}
                    showToast={showToast}
                  />
                )}
                {selectedTab === 1 && (
                  <ProviderTab
                    category="payments"
                    adapters={data.payments.available}
                    connected={data.payments.connected}
                    showToast={showToast}
                  />
                )}
                {selectedTab === 2 && (
                  <ProviderTab
                    category="wms"
                    adapters={data.wms.available}
                    connected={data.wms.connected}
                    showToast={showToast}
                  />
                )}
                {selectedTab === 3 && (
                  <ComingSoonTab
                    title="Chat Integrations"
                    description="Chat integrations will allow you to connect WhatsApp and helpdesk platforms. Webhook endpoints are available at /api/webhooks/chat/{provider}"
                  />
                )}
                {selectedTab === 4 && (
                  <ComingSoonTab
                    title="Mobile App Builders"
                    description="Mobile app builder integrations will allow you to sync returns data with Vajro, Tapcart, and other mobile commerce platforms."
                  />
                )}
                {selectedTab === 5 && (
                  <ComingSoonTab
                    title="Marketing & CRM"
                    description="Marketing and CRM integrations will connect your returns data to Klaviyo, HubSpot, and other platforms for customer retention workflows."
                  />
                )}
              </Box>
            </Tabs>
          </Layout.Section>
        </Layout>

        {toastMessage && (
          <Toast
            content={toastMessage}
            error={toastError}
            onDismiss={dismissToast}
            duration={4000}
          />
        )}
      </Page>
    </Frame>
  );
}

// ── Provider Tab ─────────────────────────────────────────────────────────────

interface ProviderTabProps {
  category: "logistics" | "payments" | "wms";
  adapters: AdapterInfo[];
  connected: ConnectedConfig[];
  showToast: (message: string, isError?: boolean) => void;
}

function ProviderTab({ category, adapters, connected, showToast }: ProviderTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterInfo | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "critical"; message: string } | null>(null);

  const connectFetcher = useFetcher<{ success: boolean; message: string }>();
  const testFetcher = useFetcher<{ success: boolean; message: string }>();
  const disconnectFetcher = useFetcher<{ success: boolean; message: string }>();
  const defaultFetcher = useFetcher<{ success: boolean; message: string }>();

  const connectedMap = new Map(connected.map((c) => [c.providerKey, c]));

  const openModal = useCallback((adapter: AdapterInfo) => {
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

  // Handle connect response
  useEffect(() => {
    if (connectFetcher.data) {
      if (connectFetcher.data.success) {
        showToast(connectFetcher.data.message);
        closeModal();
      } else {
        setFeedback({ type: "critical", message: connectFetcher.data.message });
      }
    }
  }, [connectFetcher.data, showToast, closeModal]);

  // Handle test response
  useEffect(() => {
    if (testFetcher.data) {
      if (testFetcher.data.success) {
        setFeedback({ type: "success", message: testFetcher.data.message });
      } else {
        setFeedback({ type: "critical", message: testFetcher.data.message });
      }
    }
  }, [testFetcher.data]);

  // Handle disconnect response
  useEffect(() => {
    if (disconnectFetcher.data) {
      if (disconnectFetcher.data.success) {
        showToast(disconnectFetcher.data.message);
      } else {
        showToast(disconnectFetcher.data.message, true);
      }
    }
  }, [disconnectFetcher.data, showToast]);

  // Handle set_default response
  useEffect(() => {
    if (defaultFetcher.data) {
      if (defaultFetcher.data.success) {
        showToast(defaultFetcher.data.message);
      } else {
        showToast(defaultFetcher.data.message, true);
      }
    }
  }, [defaultFetcher.data, showToast]);

  const handleTestConnection = useCallback(() => {
    if (!selectedAdapter) return;
    const formData = new FormData();
    formData.set("intent", "test");
    formData.set("category", category);
    formData.set("providerKey", selectedAdapter.key);
    formData.set("credentials", JSON.stringify(credentialValues));
    testFetcher.submit(formData, { method: "post" });
  }, [selectedAdapter, category, credentialValues, testFetcher]);

  const handleConnect = useCallback(() => {
    if (!selectedAdapter) return;

    // Validate required fields
    for (const field of selectedAdapter.credentialFields) {
      if (field.required && !credentialValues[field.key]?.trim()) {
        setFeedback({ type: "critical", message: `${field.label} is required.` });
        return;
      }
    }

    const formData = new FormData();
    formData.set("intent", "connect");
    formData.set("category", category);
    formData.set("providerKey", selectedAdapter.key);
    formData.set("displayName", selectedAdapter.displayName);
    formData.set("credentials", JSON.stringify(credentialValues));
    formData.set("isDefault", String(setAsDefault));
    formData.set("region", selectedAdapter.region || "global");
    connectFetcher.submit(formData, { method: "post" });
  }, [selectedAdapter, category, credentialValues, setAsDefault, connectFetcher]);

  const handleDisconnect = useCallback(
    (providerKey: string) => {
      const formData = new FormData();
      formData.set("intent", "disconnect");
      formData.set("category", category);
      formData.set("providerKey", providerKey);
      disconnectFetcher.submit(formData, { method: "post" });
    },
    [category, disconnectFetcher],
  );

  const handleSetDefault = useCallback(
    (providerKey: string) => {
      const formData = new FormData();
      formData.set("intent", "set_default");
      formData.set("category", category);
      formData.set("providerKey", providerKey);
      defaultFetcher.submit(formData, { method: "post" });
    },
    [category, defaultFetcher],
  );

  const isConnecting = connectFetcher.state !== "idle";
  const isTesting = testFetcher.state !== "idle";

  return (
    <>
      {adapters.length === 0 ? (
        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" tone="subdued">
              No {category} adapters are registered. Check your adapter configuration.
            </Text>
          </BlockStack>
        </Card>
      ) : (
        <Grid>
          {adapters.map((adapter) => {
            const config = connectedMap.get(adapter.key);
            const isConnected = !!config;
            const isDefault = config?.isDefault ?? false;

            return (
              <Grid.Cell
                key={adapter.key}
                columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}
              >
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Text as="h3" variant="headingMd">
                        {adapter.displayName}
                      </Text>
                      <Badge tone={isConnected ? "success" : undefined}>
                        {isConnected ? "Connected" : "Not connected"}
                      </Badge>
                    </InlineStack>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Region: {adapter.region}
                    </Text>

                    {adapter.supportsRefund !== undefined && (
                      <InlineStack gap="100">
                        {adapter.supportsRefund && (
                          <Badge size="small">Refund</Badge>
                        )}
                        {adapter.supportsStoreCredit && (
                          <Badge size="small">Store Credit</Badge>
                        )}
                      </InlineStack>
                    )}

                    {isConnected && isDefault && (
                      <Badge tone="info">Default</Badge>
                    )}

                    <InlineStack gap="200">
                      <Button onClick={() => openModal(adapter)}>
                        {isConnected ? "Manage" : "Connect"}
                      </Button>
                      {isConnected && !isDefault && (
                        <Button onClick={() => handleSetDefault(adapter.key)}>
                          Set Default
                        </Button>
                      )}
                      {isConnected && (
                        <Button
                          tone="critical"
                          onClick={() => handleDisconnect(adapter.key)}
                        >
                          Disconnect
                        </Button>
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
            loading: isConnecting,
            disabled: isConnecting,
          }}
          secondaryActions={[
            {
              content: "Test Connection",
              onAction: handleTestConnection,
              loading: isTesting,
              disabled: isTesting,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {feedback && (
                <Banner
                  title={feedback.type === "success" ? "Success" : "Error"}
                  tone={feedback.type}
                  onDismiss={() => setFeedback(null)}
                >
                  <p>{feedback.message}</p>
                </Banner>
              )}

              <FormLayout>
                {selectedAdapter.credentialFields.map((field) => {
                  if (field.type === "select" && field.options) {
                    return (
                      <Select
                        key={field.key}
                        label={field.label}
                        options={field.options}
                        value={credentialValues[field.key] || ""}
                        onChange={(val) => updateCredential(field.key, val)}
                        helpText={field.helpText}
                        requiredIndicator={field.required}
                      />
                    );
                  }

                  return (
                    <TextField
                      key={field.key}
                      label={field.label}
                      type={field.type === "password" ? "password" : "text"}
                      value={credentialValues[field.key] || ""}
                      onChange={(val) => updateCredential(field.key, val)}
                      placeholder={field.placeholder}
                      helpText={field.helpText}
                      autoComplete="off"
                      requiredIndicator={field.required}
                    />
                  );
                })}

                <Checkbox
                  label="Set as default provider"
                  checked={setAsDefault}
                  onChange={setSetAsDefault}
                  helpText={`When enabled, this ${category} provider will be used by default for new operations.`}
                />
              </FormLayout>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
}

// ── Coming Soon Tab ──────────────────────────────────────────────────────────

interface ComingSoonTabProps {
  title: string;
  description: string;
}

function ComingSoonTab({ title, description }: ComingSoonTabProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingLg">
          {title}
        </Text>
        <Banner tone="info">
          <p>{description}</p>
        </Banner>
        <Text as="p" variant="bodySm" tone="subdued">
          This integration category is on the roadmap. Contact support if you
          need early access.
        </Text>
      </BlockStack>
    </Card>
  );
}
