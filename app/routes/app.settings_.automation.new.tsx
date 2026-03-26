import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { requireAppAuth } from "../services/app-auth.server";
import prisma from "../db.server";
import RuleBuilder from "../components/RuleBuilder";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAppAuth(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAppAuth(request);
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const matchType = formData.get("matchType") as string;
  const conditionsRaw = formData.get("conditions") as string;
  const actionsRaw = formData.get("actions") as string;

  if (!name?.trim()) return json({ error: "Rule name is required." });

  let conditions, actions;
  try {
    conditions = JSON.parse(conditionsRaw || "[]");
    actions = JSON.parse(actionsRaw || "[]");
  } catch {
    return json({ error: "Invalid conditions or actions format." });
  }

  if (conditions.length === 0) return json({ error: "At least one condition is required." });
  if (actions.length === 0) return json({ error: "At least one action is required." });

  await prisma.automationRule.create({
    data: { shop, name: name.trim(), description: description?.trim() || null, matchType: matchType || "ALL", conditions, actions, isActive: true },
  });

  return redirect("/app/settings/automation");
};

export default function NewAutomationRule() {
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <RuleBuilder
      title="Create new rule"
      error={actionData?.error}
      isSubmitting={isSubmitting}
      onSave={(data) => {
        const fd = new FormData();
        fd.set("name", data.name);
        fd.set("description", data.description);
        fd.set("matchType", data.matchType);
        fd.set("conditions", JSON.stringify(data.conditions));
        fd.set("actions", JSON.stringify(data.actions));
        submit(fd, { method: "post" });
      }}
    />
  );
}
