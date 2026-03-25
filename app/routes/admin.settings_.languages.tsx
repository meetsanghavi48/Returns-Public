import { Page, Card, Text, BlockStack, Banner } from "@shopify/polaris";

export default function SettingsLanguages() {
  return (
    <Page backAction={{ content: "Settings", url: "/admin/settings" }} title="Languages">
      <Card>
        <BlockStack gap="300">
          <Banner tone="info">
            <p>This feature is coming soon.</p>
          </Banner>
          <Text as="p">Configuration for Languages will be available in a future update.</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
