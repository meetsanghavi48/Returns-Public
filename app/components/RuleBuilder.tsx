import {
  Page, Card, FormLayout, TextField, Select, Button, Banner,
  BlockStack, InlineStack, Text, Divider, RadioButton, Frame,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useNavigate } from "@remix-run/react";
import { CONDITION_TYPES, ACTION_TYPES } from "~/services/automation-types";

interface RuleData {
  name: string;
  description: string;
  matchType: string;
  conditions: Array<{ type: string; operator?: string; value?: string | number }>;
  actions: Array<{ type: string; config?: Record<string, string | number> }>;
}

interface RuleBuilderProps {
  title: string;
  initialData?: RuleData;
  error?: string;
  isSubmitting: boolean;
  onSave: (data: RuleData) => void;
}

export default function RuleBuilder({ title, initialData, error, isSubmitting, onSave }: RuleBuilderProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [matchType, setMatchType] = useState(initialData?.matchType || "ALL");
  const [conditions, setConditions] = useState<RuleData["conditions"]>(initialData?.conditions || [{ type: "", operator: "", value: "" }]);
  const [actions, setActions] = useState<RuleData["actions"]>(initialData?.actions || [{ type: "", config: {} }]);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { type: "", operator: "", value: "" }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCondition = useCallback((index: number, field: string, value: string) => {
    setConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Reset operator/value when type changes
      if (field === "type") {
        next[index].operator = "";
        next[index].value = "";
      }
      return next;
    });
  }, []);

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { type: "", config: {} }]);
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateActionType = useCallback((index: number, type: string) => {
    setActions((prev) => {
      const next = [...prev];
      next[index] = { type, config: {} };
      return next;
    });
  }, []);

  const updateActionConfig = useCallback((index: number, key: string, value: string) => {
    setActions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], config: { ...next[index].config, [key]: value } };
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    onSave({ name, description, matchType, conditions, actions });
  }, [name, description, matchType, conditions, actions, onSave]);

  const usedConditionTypes = conditions.map((c) => c.type).filter(Boolean);

  return (
    <Frame>
      <Page
        backAction={{ content: "Automations", url: "/app/settings/automation" }}
        title={title}
        primaryAction={{ content: "Save Rule", onAction: handleSave, loading: isSubmitting, disabled: isSubmitting }}
        secondaryActions={[{ content: "Cancel", onAction: () => navigate("/app/settings/automation") }]}
      >
        {error && (
          <Banner tone="critical" title="Error"><p>{error}</p></Banner>
        )}

        <BlockStack gap="400">
          {/* Basic Info */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Rule Details</Text>
              <FormLayout>
                <TextField label="Rule name" value={name} onChange={setName} autoComplete="off" requiredIndicator />
                <TextField label="Description (optional)" value={description} onChange={setDescription} autoComplete="off" multiline={2} />
              </FormLayout>
            </BlockStack>
          </Card>

          {/* Match Type */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Match Type</Text>
              <InlineStack gap="400">
                <RadioButton label="Match ALL conditions" checked={matchType === "ALL"} id="match-all" name="matchType" onChange={() => setMatchType("ALL")} />
                <RadioButton label="Match ANY condition" checked={matchType === "ANY"} id="match-any" name="matchType" onChange={() => setMatchType("ANY")} />
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Conditions */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">If (Conditions)</Text>
                <Button size="slim" onClick={addCondition}>+ Add condition</Button>
              </InlineStack>

              {conditions.map((condition, i) => {
                const typeDef = CONDITION_TYPES.find((t) => t.key === condition.type);
                const operators = typeDef?.operators || [];
                const isUsedElsewhere = usedConditionTypes.filter((t) => t === condition.type).length > 1;

                return (
                  <div key={i}>
                    {i > 0 && <Divider />}
                    <div style={{ paddingTop: i > 0 ? 12 : 0 }}>
                      <InlineStack gap="200" blockAlign="start" wrap={false}>
                        <div style={{ flex: 1 }}>
                          <Select
                            label="Condition"
                            labelHidden
                            options={[
                              { label: "Select condition...", value: "" },
                              ...CONDITION_TYPES.map((t) => ({
                                label: t.label + (usedConditionTypes.includes(t.key) && t.key !== condition.type ? " (in use)" : ""),
                                value: t.key,
                              })),
                            ]}
                            value={condition.type}
                            onChange={(val) => updateCondition(i, "type", val)}
                          />
                        </div>

                        {operators.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <Select
                              label="Operator"
                              labelHidden
                              options={[
                                { label: "Select...", value: "" },
                                ...operators.map((op) => ({ label: op.replace(/_/g, " "), value: op })),
                              ]}
                              value={String(condition.operator || "")}
                              onChange={(val) => updateCondition(i, "operator", val)}
                            />
                          </div>
                        )}

                        {typeDef && !["is_empty", "is_not_empty"].includes(String(condition.operator)) && (
                          <div style={{ flex: 1 }}>
                            {typeDef.valueType === "select" && typeDef.options ? (
                              <Select
                                label="Value"
                                labelHidden
                                options={[{ label: "Select...", value: "" }, ...typeDef.options]}
                                value={String(condition.value || "")}
                                onChange={(val) => updateCondition(i, "value", val)}
                              />
                            ) : (
                              <TextField
                                label="Value"
                                labelHidden
                                type={typeDef.valueType === "number" ? "number" : "text"}
                                value={String(condition.value || "")}
                                onChange={(val) => updateCondition(i, "value", val)}
                                autoComplete="off"
                                placeholder={typeDef.valueType === "number" ? "0" : "Enter value..."}
                              />
                            )}
                          </div>
                        )}

                        <Button size="slim" tone="critical" onClick={() => removeCondition(i)} disabled={conditions.length <= 1}>
                          Remove
                        </Button>
                      </InlineStack>
                    </div>
                  </div>
                );
              })}
            </BlockStack>
          </Card>

          {/* Actions */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Then (Actions)</Text>
                <Button size="slim" onClick={addAction}>+ Add action</Button>
              </InlineStack>

              {actions.map((action, i) => {
                const actionDef = ACTION_TYPES.find((t) => t.key === action.type);

                return (
                  <div key={i}>
                    {i > 0 && <Divider />}
                    <div style={{ paddingTop: i > 0 ? 12 : 0 }}>
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="start">
                          <div style={{ flex: 1 }}>
                            <Select
                              label="Action"
                              labelHidden
                              options={[
                                { label: "Select action...", value: "" },
                                ...ACTION_TYPES.map((t) => ({ label: t.label, value: t.key })),
                              ]}
                              value={action.type}
                              onChange={(val) => updateActionType(i, val)}
                            />
                          </div>
                          <Button size="slim" tone="critical" onClick={() => removeAction(i)} disabled={actions.length <= 1}>
                            Remove
                          </Button>
                        </InlineStack>

                        {actionDef && actionDef.configFields.length > 0 && (
                          <div style={{ paddingLeft: 16 }}>
                            <FormLayout>
                              {actionDef.configFields.map((field) => {
                                if (field.type === "select" && "options" in field && Array.isArray((field as any).options)) {
                                  return (
                                    <Select
                                      key={field.key}
                                      label={field.label}
                                      options={[
                                        { label: "Select...", value: "" },
                                        ...((field as any).options as string[]).map((o: string) => ({ label: o, value: o })),
                                      ]}
                                      value={String(action.config?.[field.key] || "")}
                                      onChange={(val) => updateActionConfig(i, field.key, val)}
                                    />
                                  );
                                }
                                return (
                                  <TextField
                                    key={field.key}
                                    label={field.label}
                                    type={field.type === "number" ? "number" : "text"}
                                    value={String(action.config?.[field.key] || "")}
                                    onChange={(val) => updateActionConfig(i, field.key, val)}
                                    autoComplete="off"
                                    multiline={field.type === "textarea" ? 3 : undefined}
                                  />
                                );
                              })}
                            </FormLayout>
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  </div>
                );
              })}
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </Frame>
  );
}
