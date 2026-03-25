import { useState, useCallback } from "react";
import { Link } from "@remix-run/react";
import { CONDITION_TYPES, ACTION_TYPES } from "../services/automation-types";

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/admin/settings/automation" style={{ color: "var(--admin-accent)", textDecoration: "none", fontSize: 13 }}>&#8249; Automations</Link>
          <h1 style={{ margin: "4px 0 0" }}>{title}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/admin/settings/automation" className="admin-btn">Cancel</Link>
          <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Rule"}
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-card" style={{ background: "#FEF2F2", borderLeft: "4px solid var(--admin-danger)", marginBottom: 16, padding: 12 }}>
          <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Basic Info */}
      <div className="admin-card" style={{ marginBottom: 20, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Rule Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Rule name *</label>
            <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auto-approve under 500" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Description</label>
            <input className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" style={{ width: "100%" }} />
          </div>
        </div>
      </div>

      {/* Match Type */}
      <div className="admin-card" style={{ marginBottom: 20, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Match Type</h3>
        <div style={{ display: "flex", gap: 12 }}>
          {["ALL", "ANY"].map((mt) => (
            <label key={mt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
              <input type="radio" name="matchType" checked={matchType === mt} onChange={() => setMatchType(mt)} />
              Match <strong>{mt}</strong> conditions
            </label>
          ))}
        </div>
      </div>

      {/* Conditions */}
      <div className="admin-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>If (Conditions)</h3>
          <button className="admin-btn admin-btn-sm" onClick={addCondition}>+ Add condition</button>
        </div>

        {conditions.map((condition, i) => {
          const typeDef = CONDITION_TYPES.find((t) => t.key === condition.type);
          const operators = typeDef?.operators || [];

          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12, paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
              <select className="admin-input" value={condition.type} onChange={(e) => updateCondition(i, "type", e.target.value)} style={{ flex: 1 }}>
                <option value="">Select condition...</option>
                {CONDITION_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>

              {operators.length > 0 && (
                <select className="admin-input" value={String(condition.operator || "")} onChange={(e) => updateCondition(i, "operator", e.target.value)} style={{ flex: 1 }}>
                  <option value="">Select...</option>
                  {operators.map((op) => (
                    <option key={op} value={op}>{op.replace(/_/g, " ")}</option>
                  ))}
                </select>
              )}

              {typeDef && !["is_empty", "is_not_empty"].includes(String(condition.operator)) && (
                typeDef.valueType === "select" && typeDef.options ? (
                  <select className="admin-input" value={String(condition.value || "")} onChange={(e) => updateCondition(i, "value", e.target.value)} style={{ flex: 1 }}>
                    <option value="">Select...</option>
                    {typeDef.options.map((o: any) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="admin-input"
                    type={typeDef.valueType === "number" ? "number" : "text"}
                    value={String(condition.value || "")}
                    onChange={(e) => updateCondition(i, "value", e.target.value)}
                    placeholder={typeDef.valueType === "number" ? "0" : "Enter value..."}
                    style={{ flex: 1 }}
                  />
                )
              )}

              <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => removeCondition(i)} disabled={conditions.length <= 1}>
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="admin-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Then (Actions)</h3>
          <button className="admin-btn admin-btn-sm" onClick={addAction}>+ Add action</button>
        </div>

        {actions.map((action, i) => {
          const actionDef = ACTION_TYPES.find((t) => t.key === action.type);

          return (
            <div key={i} style={{ marginBottom: 16, paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <select className="admin-input" value={action.type} onChange={(e) => updateActionType(i, e.target.value)} style={{ flex: 1 }}>
                  <option value="">Select action...</option>
                  {ACTION_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => removeAction(i)} disabled={actions.length <= 1}>
                  Remove
                </button>
              </div>

              {actionDef && actionDef.configFields.length > 0 && (
                <div style={{ paddingLeft: 16 }}>
                  {actionDef.configFields.map((field) => (
                    <div key={field.key} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{field.label}</label>
                      {field.type === "select" && "options" in field && Array.isArray((field as any).options) ? (
                        <select className="admin-input" value={String(action.config?.[field.key] || "")} onChange={(e) => updateActionConfig(i, field.key, e.target.value)} style={{ width: "100%" }}>
                          <option value="">Select...</option>
                          {((field as any).options as string[]).map((o: string) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea className="admin-input" value={String(action.config?.[field.key] || "")} onChange={(e) => updateActionConfig(i, field.key, e.target.value)} rows={3} style={{ width: "100%", resize: "vertical" }} />
                      ) : (
                        <input className="admin-input" type={field.type === "number" ? "number" : "text"} value={String(action.config?.[field.key] || "")} onChange={(e) => updateActionConfig(i, field.key, e.target.value)} style={{ width: "100%" }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
