import { Page, Card, Text, BlockStack, Banner } from "@shopify/polaris";

export default function SettingsUsers() {
  return (
    <Page backAction={{ content: "Settings", url: "/admin/settings" }} title="Users">
      <Card>
        <BlockStack gap="300">
          <Banner tone="info">
            <p>This feature is coming soon.</p>
          </Banner>
          <Text as="p">Configuration for Users will be available in a future update.</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
