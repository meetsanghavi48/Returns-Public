import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import "~/adapters/logistics/index";
import { logisticsRegistry } from "~/adapters/logistics/registry";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { encrypt, decrypt } from "~/utils/encryption.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const providerKey = formData.get("providerKey") as string;

  if (!providerKey) {
    return json({ success: false, message: "Provider key is required." }, { status: 400 });
  }

  const entry = logisticsRegistry.get(providerKey);
  if (!entry) {
    return json({ success: false, message: `Unknown logistics provider: ${providerKey}` }, { status: 400 });
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  if (intent === "connect") {
    const credentialsRaw = formData.get("credentials") as string;
    const isDefault = formData.get("isDefault") === "true";

    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." }, { status: 400 });
    }

    // Validate required fields
    for (const field of entry.credentialFields) {
      if (field.required && !credentials[field.key]?.trim()) {
        return json(
          { success: false, message: `${field.label} is required.` },
          { status: 400 },
        );
      }
    }

    // Validate credentials via adapter
    try {
      const result = await entry.adapter.validateCredentials(credentials);
      if (!result.valid) {
        return json(
          { success: false, message: result.error || "Credential validation failed." },
          { status: 400 },
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Credential validation failed.";
      return json({ success: false, message: msg }, { status: 500 });
    }

    const encryptedCredentials = encrypt(JSON.stringify(credentials));

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
        displayName: entry.displayName,
        isDefault,
        isActive: true,
        region: entry.region,
      },
      create: {
        shop,
        providerKey,
        displayName: entry.displayName,
        credentials: encryptedCredentials,
        isDefault,
        isActive: true,
        region: entry.region,
      },
    });

    return json({ success: true, message: `${entry.displayName} connected successfully.` });
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────
  if (intent === "disconnect") {
    try {
      await prisma.logisticsConfig.update({
        where: { shop_providerKey: { shop, providerKey } },
        data: { isActive: false, isDefault: false },
      });
      return json({ success: true, message: `${entry.displayName} disconnected.` });
    } catch {
      return json({ success: false, message: "Provider config not found." }, { status: 404 });
    }
  }

  // ── Test ────────────────────────────────────────────────────────────────────
  if (intent === "test") {
    const credentialsRaw = formData.get("credentials") as string;

    let credentials: Record<string, string>;
    try {
      credentials = JSON.parse(credentialsRaw);
    } catch {
      return json({ success: false, message: "Invalid credentials format." }, { status: 400 });
    }

    try {
      const result = await entry.adapter.validateCredentials(credentials);
      if (result.valid) {
        return json({ success: true, message: "Credentials validated successfully." });
      }
      return json({ success: false, message: result.error || "Validation failed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection test failed.";
      return json({ success: false, message: msg }, { status: 500 });
    }
  }

  // ── Test stored credentials ─────────────────────────────────────────────────
  if (intent === "test_stored") {
    try {
      const config = await prisma.logisticsConfig.findUnique({
        where: { shop_providerKey: { shop, providerKey } },
      });
      if (!config || !config.isActive) {
        return json({ success: false, message: "No active config found." }, { status: 404 });
      }

      const credentials = JSON.parse(decrypt(config.credentials));
      const result = await entry.adapter.validateCredentials(credentials);
      if (result.valid) {
        return json({ success: true, message: "Stored credentials are valid." });
      }
      return json({ success: false, message: result.error || "Stored credentials validation failed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection test failed.";
      return json({ success: false, message: msg }, { status: 500 });
    }
  }

  // ── Set Default ─────────────────────────────────────────────────────────────
  if (intent === "set_default") {
    await prisma.logisticsConfig.updateMany({
      where: { shop, isDefault: true },
      data: { isDefault: false },
    });
    await prisma.logisticsConfig.update({
      where: { shop_providerKey: { shop, providerKey } },
      data: { isDefault: true },
    });
    return json({ success: true, message: `${entry.displayName} set as default logistics provider.` });
  }

  return json({ success: false, message: "Unknown intent." }, { status: 400 });
};
