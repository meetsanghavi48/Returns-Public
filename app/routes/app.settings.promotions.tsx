import { Page, Card, Text, BlockStack, Banner } from "@shopify/polaris";

export default function SettingsPromotions() {
  return (
    <Page backAction={{ content: "Settings", url: "/app/settings" }} title="Promotions">
      <Card>
        <BlockStack gap="300">
          <Banner tone="info">
            <p>This feature is coming soon.</p>
          </Banner>
          <Text as="p">Configuration for Promotions will be available in a future update.</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
