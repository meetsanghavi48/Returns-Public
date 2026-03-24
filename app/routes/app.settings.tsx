import { Page, Grid, Card, BlockStack, Text, Icon, InlineStack } from "@shopify/polaris";
import { useNavigate } from "@remix-run/react";
import {
  SettingsIcon,
  GlobeIcon,
  ShieldCheckMarkIcon as LegalIcon,
  LocationIcon,
  DeliveryIcon,
  ChatIcon,
  ReceiptDollarIcon as BillingStatementDollarIcon,
  PersonIcon,
  NotificationIcon,
  AppsIcon,
  AutomationIcon,
  DiscountIcon,
} from "@shopify/polaris-icons";

interface SettingsCardProps {
  title: string;
  description: string;
  icon: typeof SettingsIcon;
  url: string;
}

function SettingsCard({ title, description, icon, url }: SettingsCardProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{ cursor: "pointer" }}
      onClick={() => navigate(url)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(url);
      }}
    >
      <Card>
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={icon} />
            <Text as="h3" variant="headingMd">
              {title}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>
      </Card>
    </div>
  );
}

export default function SettingsHub() {
  return (
    <Page title="Settings">
      <BlockStack gap="400">
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="General"
              description="View and update your store details"
              icon={SettingsIcon}
              url="/app/settings/general"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Languages"
              description="Show your return portal in multiple languages"
              icon={GlobeIcon}
              url="/app/settings/languages"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Policies"
              description="Manage your returns/exchange policies and rules"
              icon={LegalIcon}
              url="/app/settings/policies"
            />
          </Grid.Cell>
        </Grid>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Locations"
              description="Setup locations where you receive returned products"
              icon={LocationIcon}
              url="/app/settings/locations"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Logistics"
              description="Manage your logistic integrations"
              icon={DeliveryIcon}
              url="/app/settings/logistics"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Reasons"
              description="View and update allowed reasons and refund options"
              icon={ChatIcon}
              url="/app/settings/reasons"
            />
          </Grid.Cell>
        </Grid>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Billing"
              description="Manage plans and track usage"
              icon={BillingStatementDollarIcon}
              url="/app/settings/billing"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Users"
              description="Manage users and control access"
              icon={PersonIcon}
              url="/app/settings/users"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Notifications"
              description="Manage notifications sent to you and customers"
              icon={NotificationIcon}
              url="/app/settings/notifications"
            />
          </Grid.Cell>
        </Grid>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Payments"
              description="Manage payment partner integrations for refunds"
              icon={DiscountIcon}
              url="/app/settings/payments"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Integrations"
              description="Connect chat, mobile, marketing & WMS platforms"
              icon={AppsIcon}
              url="/app/settings/integrations"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <SettingsCard
              title="Automation"
              description="Create rules to automatically perform actions"
              icon={AutomationIcon}
              url="/app/settings/automation"
            />
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}
