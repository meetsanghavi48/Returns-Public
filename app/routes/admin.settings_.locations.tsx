import { Page, Card, Text, BlockStack, Banner } from "@shopify/polaris";

export default function SettingsLocations() {
  return (
    <Page backAction={{ content: "Settings", url: "/admin/settings" }} title="Locations">
      <Card>
        <BlockStack gap="300">
          <Banner tone="info">
            <p>This feature is coming soon.</p>
          </Banner>
          <Text as="p">Configuration for Locations will be available in a future update.</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
