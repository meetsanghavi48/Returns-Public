import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
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
  Frame,
  Toast,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

import "~/adapters/logistics/index";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { encrypt } from "~/utils/encryption.server";

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
}

interface ConnectedConfig {
  providerKey: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  region?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const logisticsConfigs = await prisma.logisticsConfig.findMany({
    where: { shop, isActive: true },
    select: {
      providerKey: true,
      displayName: true,
      isDefault: true,
      isActive: true,
      region: true,
    },
  });

  const available: AdapterInfo[] = logisticsRegistry.list().map((a) => ({
    key: a.key,
    displayName: a.displayName,
    region: a.region,
    logoUrl: a.logoUrl,
    credentialFields: a.credentialFields,
  }));

  return json({ available, connected: logisticsConfigs as ConnectedConfig[] });
};

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
    const region = (formData.get("region") as string) || "global";

    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." });
    }

    try {
      const entry = logisticsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown logistics provider." });
      const validationResult = await entry.adapter.validateCredentials(credentials);
      if (!validationResult.valid) {
        return json({ success: false, message: validationResult.error || "Credential validation failed." });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Credential validation failed.";
      return json({ success: false, message: errorMessage });
    }

    const encryptedCredentials = encrypt(credentialsRaw);

    if (isDefault) {
      await prisma.logisticsConfig.updateMany({
        where: { shop, isDefault: true },
        data: { isDefault: false },
      });
    }

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

    return json({ success: true, message: `${displayName} connected successfully.` });
  }

  if (intent === "disconnect") {
    await prisma.logisticsConfig.updateMany({
      where: { shop, providerKey },
      data: { isActive: false },
    });
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
      const entry = logisticsRegistry.get(providerKey);
      if (!entry) return json({ success: false, message: "Unknown logistics provider." });
      const result = await entry.adapter.validateCredentials(credentials);
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
    await prisma.logisticsConfig.updateMany({
      where: { shop, isDefault: true },
      data: { isDefault: false },
    });
    await prisma.logisticsConfig.updateMany({
      where: { shop, providerKey },
      data: { isDefault: true },
    });
    return json({ success: true, message: "Default provider updated." });
  }

  return json({ success: false, message: "Unknown intent." });
};

export default function SettingsLogistics() {
  const { available, connected } = useLoaderData<typeof loader>();
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
        title="Logistics"
        subtitle="Manage your logistics provider integrations"
      >
        <LogisticsProviderList
          adapters={available as AdapterInfo[]}
          connected={connected as ConnectedConfig[]}
          showToast={showToast}
        />
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

interface LogisticsProviderListProps {
  adapters: AdapterInfo[];
  connected: ConnectedConfig[];
  showToast: (message: string, isError?: boolean) => void;
}

function LogisticsProviderList({ adapters, connected, showToast }: LogisticsProviderListProps) {
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

  useEffect(() => {
    if (testFetcher.data) {
      if (testFetcher.data.success) {
        setFeedback({ type: "success", message: testFetcher.data.message });
      } else {
        setFeedback({ type: "critical", message: testFetcher.data.message });
      }
    }
  }, [testFetcher.data]);

  useEffect(() => {
    if (disconnectFetcher.data) {
      if (disconnectFetcher.data.success) {
        showToast(disconnectFetcher.data.message);
      } else {
        showToast(disconnectFetcher.data.message, true);
      }
    }
  }, [disconnectFetcher.data, showToast]);

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
    formData.set("providerKey", selectedAdapter.key);
    formData.set("credentials", JSON.stringify(credentialValues));
    testFetcher.submit(formData, { method: "post" });
  }, [selectedAdapter, credentialValues, testFetcher]);

  const handleConnect = useCallback(() => {
    if (!selectedAdapter) return;
    for (const field of selectedAdapter.credentialFields) {
      if (field.required && !credentialValues[field.key]?.trim()) {
        setFeedback({ type: "critical", message: `${field.label} is required.` });
        return;
      }
    }
    const formData = new FormData();
    formData.set("intent", "connect");
    formData.set("providerKey", selectedAdapter.key);
    formData.set("displayName", selectedAdapter.displayName);
    formData.set("credentials", JSON.stringify(credentialValues));
    formData.set("isDefault", String(setAsDefault));
    formData.set("region", selectedAdapter.region || "global");
    connectFetcher.submit(formData, { method: "post" });
  }, [selectedAdapter, credentialValues, setAsDefault, connectFetcher]);

  const handleDisconnect = useCallback(
    (providerKey: string) => {
      const formData = new FormData();
      formData.set("intent", "disconnect");
      formData.set("providerKey", providerKey);
      disconnectFetcher.submit(formData, { method: "post" });
    },
    [disconnectFetcher],
  );

  const handleSetDefault = useCallback(
    (providerKey: string) => {
      const formData = new FormData();
      formData.set("intent", "set_default");
      formData.set("providerKey", providerKey);
      defaultFetcher.submit(formData, { method: "post" });
    },
    [defaultFetcher],
  );

  const isConnecting = connectFetcher.state !== "idle";
  const isTesting = testFetcher.state !== "idle";

  return (
    <>
      {adapters.length === 0 ? (
        <Card>
          <Text as="p" variant="bodyMd" tone="subdued">
            No logistics adapters are registered. Check your adapter configuration.
          </Text>
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

                    {isConnected && isDefault && (
                      <Badge tone="info">Default</Badge>
                    )}

                    <InlineStack gap="200">
                      <Button onClick={() => openModal(adapter)}>
                        {isConnected ? "Manage" : "Connect"}
                      </Button>
                      {isConnected && !isDefault && (
                        <Button onClick={() => handleSetDefault(adapter.key)}>
                          Set as Default
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
                  helpText="When enabled, this logistics provider will be used by default for new operations."
                />
              </FormLayout>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
}
