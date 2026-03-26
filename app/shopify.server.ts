import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  DeliveryMethod,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await prisma.shop.upsert({
        where: { shop: session.shop },
        update: {
          accessToken: session.accessToken!,
          scopes: session.scope || "",
          uninstalledAt: null,
        },
        create: {
          shop: session.shop,
          accessToken: session.accessToken!,
          scopes: session.scope || "",
        },
      });

      await prisma.exchangeCounter.upsert({
        where: { shop: session.shop },
        update: {},
        create: { shop: session.shop, lastNumber: 9000 },
      });

      const defaults: Record<string, unknown> = {
        return_window_days: 30,
        restocking_fee_pct: 0,
        return_shipping_fee: 100,
        auto_approve: true,
      };

      for (const [key, value] of Object.entries(defaults)) {
        await prisma.settings.upsert({
          where: { shop_key: { shop: session.shop, key } },
          update: {},
          create: { shop: session.shop, key, value: value as any },
        });
      }

      shopify.registerWebhooks({ session });

      // Check if owner exists — if not, redirect to signup
      const ownerExists = await prisma.appUser.findFirst({
        where: { shop: session.shop, role: "owner" },
      });
      if (!ownerExists) {
        // Try auto-matching by email from Shopify session
        if (session.email) {
          const matchedUser = await prisma.appUser.findFirst({
            where: { shop: session.shop, email: session.email, inviteAccepted: true },
          });
          if (matchedUser) {
            // Auto-login handled by admin_.auth redirect
          }
        }
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
