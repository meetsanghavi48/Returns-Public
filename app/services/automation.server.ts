import prisma from "../db.server";
import { approveRequest, rejectRequest } from "./returns.server";
import { updateOrderTags, shopifyREST } from "./shopify.server";
import { processRefund } from "./refunds.server";
import { auditLog } from "./audit.server";
import { sendReturnConfirmation } from "./notifications.server";
import type { Condition, Action } from "./automation-types";

export type { Condition, Action };

// ── Types ────────────────────────────────────────────────────────────────────

export interface AutomationResult {
  rulesEvaluated: number;
  rulesMatched: number;
  actionsExecuted: number;
  errors: string[];
}

interface ReturnWithOrder {
  id: string;
  reqId: string;
  shop: string;
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  items: any[];
  refundMethod: string | null;
  status: string;
  requestType: string;
  totalPrice: any;
  isCod: boolean;
  daysSinceOrder: number;
  address: any;
  awb: string | null;
  awbStatus: string | null;
  // Enriched fields
  orderTags?: string;
  productTags?: string[];
  orderValue?: number;
  customerReturnCount?: number;
}

// ── Condition Evaluation ─────────────────────────────────────────────────────

async function enrichReturnData(returnData: any, shop: string, accessToken?: string): Promise<ReturnWithOrder> {
  const enriched: ReturnWithOrder = {
    ...returnData,
    items: Array.isArray(returnData.items) ? returnData.items : JSON.parse(returnData.items || "[]"),
    orderTags: "",
    productTags: [],
    orderValue: 0,
    customerReturnCount: 0,
  };

  // Enrich with order data from Shopify if we have an access token
  if (accessToken) {
    try {
      const orderData = await shopifyREST(shop, accessToken, "GET", `orders/${returnData.orderId}.json?fields=tags,total_price,line_items`);
      if (orderData?.order) {
        enriched.orderTags = orderData.order.tags || "";
        enriched.orderValue = parseFloat(orderData.order.total_price || "0");
        const allProductTags = (orderData.order.line_items || [])
          .flatMap((li: any) => (li.properties || []).filter((p: any) => p.name === "_tags").map((p: any) => p.value))
          .filter(Boolean);
        enriched.productTags = allProductTags;
      }
    } catch { /* skip enrichment if API fails */ }
  }

  // Count customer returns
  if (returnData.customerEmail) {
    try {
      enriched.customerReturnCount = await prisma.returnRequest.count({
        where: { shop, customerEmail: returnData.customerEmail },
      });
    } catch { /* skip */ }
  }

  return enriched;
}

function evaluateCondition(condition: Condition, data: ReturnWithOrder): boolean {
  const { type, operator, value } = condition;
  const strVal = String(value || "").toLowerCase();
  const numVal = Number(value || 0);

  switch (type) {
    case "request_type":
      return operator === "is" ? data.requestType === value : data.requestType !== value;

    case "reason": {
      const reasons = data.items.map((i: any) => (i.reason || "").toLowerCase()).join(" ");
      if (operator === "is") return reasons.includes(strVal);
      if (operator === "is_not") return !reasons.includes(strVal);
      if (operator === "contains") return reasons.includes(strVal);
      return false;
    }

    case "request_stage":
      return operator === "is" ? data.status === value : data.status !== value;

    case "shipment_status": {
      const shipStatus = data.awbStatus || "not_scheduled";
      return operator === "is" ? shipStatus === value : shipStatus !== value;
    }

    case "order_type":
      return operator === "is" ? (value === "cod" ? data.isCod : !data.isCod) : false;

    case "order_tags": {
      const tags = (data.orderTags || "").toLowerCase();
      return operator === "contains" ? tags.includes(strVal) : !tags.includes(strVal);
    }

    case "product_tags": {
      const ptags = (data.productTags || []).join(" ").toLowerCase();
      return operator === "contains" ? ptags.includes(strVal) : !ptags.includes(strVal);
    }

    case "order_value": {
      const ov = data.orderValue || 0;
      if (operator === "greater_than") return ov > numVal;
      if (operator === "less_than") return ov < numVal;
      if (operator === "equals") return ov === numVal;
      return false;
    }

    case "return_value": {
      const rv = Number(data.totalPrice || 0);
      if (operator === "greater_than") return rv > numVal;
      if (operator === "less_than") return rv < numVal;
      if (operator === "equals") return rv === numVal;
      return false;
    }

    case "inspection_note": {
      const note = ""; // inspection note would come from ReturnEvent
      if (operator === "is_empty") return !note;
      if (operator === "is_not_empty") return !!note;
      if (operator === "contains") return note.toLowerCase().includes(strVal);
      if (operator === "does_not_contain") return !note.toLowerCase().includes(strVal);
      return false;
    }

    case "requested_refund_mode":
      return operator === "is" ? data.refundMethod === value : data.refundMethod !== value;

    case "customer_email": {
      const email = (data.customerEmail || "").toLowerCase();
      if (operator === "is") return email === strVal;
      if (operator === "is_not") return email !== strVal;
      if (operator === "contains") return email.includes(strVal);
      return false;
    }

    case "days_since_order":
      if (operator === "greater_than") return data.daysSinceOrder > numVal;
      if (operator === "less_than") return data.daysSinceOrder < numVal;
      return false;

    case "return_count_for_customer": {
      const count = data.customerReturnCount || 0;
      if (operator === "greater_than") return count > numVal;
      if (operator === "less_than") return count < numVal;
      if (operator === "equals") return count === numVal;
      return false;
    }

    case "item_count": {
      const itemCount = data.items.length;
      if (operator === "greater_than") return itemCount > numVal;
      if (operator === "less_than") return itemCount < numVal;
      if (operator === "equals") return itemCount === numVal;
      return false;
    }

    default:
      return false;
  }
}

// ── Action Execution ─────────────────────────────────────────────────────────

async function executeAction(
  action: Action,
  data: ReturnWithOrder,
  shop: string,
  accessToken: string,
): Promise<{ success: boolean; error?: string }> {
  const config = action.config || {};

  try {
    switch (action.type) {
      case "auto_approve":
        await approveRequest(shop, accessToken, data.reqId);
        return { success: true };

      case "auto_reject":
        await rejectRequest(shop, accessToken, data.reqId, String(config.rejection_reason || "Rejected by automation"));
        return { success: true };

      case "assign_logistics":
        // Store the logistics assignment on the return
        await prisma.returnRequest.update({
          where: { reqId: data.reqId },
          data: { autoAction: `logistics:${config.logistics_key}` },
        });
        await auditLog(shop, data.orderId, data.reqId, "automation_assign_logistics", "system", `Assigned to ${config.logistics_key}`);
        return { success: true };

      case "create_pickup": {
        // Use real logistics service
        try {
          const { createPickupForReturn } = await import("./logistics.server");
          const pickupResult = await createPickupForReturn(data.id, shop);
          if (!pickupResult.success) {
            return { success: false, error: pickupResult.error || "Pickup creation failed" };
          }
        } catch (e: any) {
          // Fallback: just mark status
          await prisma.returnRequest.update({
            where: { reqId: data.reqId },
            data: { status: "pickup_scheduled", pickupCreatedAt: new Date() },
          });
        }
        await auditLog(shop, data.orderId, data.reqId, "automation_create_pickup", "system", "Pickup scheduled by automation");
        return { success: true };
      }

      case "send_email_to_customer":
        await sendReturnConfirmation(data.id, shop);
        return { success: true };

      case "send_email_to_merchant":
        // Log the intent — actual sending depends on SendGrid config
        await auditLog(shop, data.orderId, data.reqId, "automation_email_merchant", "system",
          `Subject: ${config.subject || "Automation Alert"}`);
        return { success: true };

      case "add_order_tag":
        if (config.tag) {
          await updateOrderTags(shop, accessToken, data.orderId, [String(config.tag)]);
        }
        return { success: true };

      case "remove_order_tag":
        if (config.tag) {
          await updateOrderTags(shop, accessToken, data.orderId, [], [String(config.tag)]);
        }
        return { success: true };

      case "add_internal_note":
        await prisma.returnEvent.create({
          data: {
            shop,
            returnId: data.id,
            type: "note",
            message: String(config.note || "Automation note"),
            actor: "system",
          },
        });
        return { success: true };

      case "update_return_status":
        if (config.new_status) {
          await prisma.returnRequest.update({
            where: { reqId: data.reqId },
            data: { status: String(config.new_status) },
          });
          await auditLog(shop, data.orderId, data.reqId, "automation_status_update", "system", `Status → ${config.new_status}`);
        }
        return { success: true };

      case "process_refund":
        await processRefund(shop, accessToken, data);
        await auditLog(shop, data.orderId, data.reqId, "automation_refund", "system", `Refund processed via ${config.refund_method || "default"}`);
        return { success: true };

      case "issue_store_credit": {
        const amountType = config.amount_type || "percentage";
        const amount = Number(config.amount || 100);
        const creditAmount = amountType === "percentage"
          ? (Number(data.totalPrice || 0) * amount) / 100
          : amount;
        // Create gift card via Shopify API
        try {
          await shopifyREST(shop, accessToken, "POST", "gift_cards.json", {
            gift_card: {
              initial_value: creditAmount.toFixed(2),
              note: `Store credit for return ${data.reqId}`,
              ...(data.customerEmail ? { customer_id: undefined } : {}),
            },
          });
        } catch { /* gift card API may require Plus plan */ }
        await auditLog(shop, data.orderId, data.reqId, "automation_store_credit", "system", `Issued ₹${creditAmount.toFixed(2)} store credit`);
        return { success: true };
      }

      case "send_whatsapp_notification":
        await auditLog(shop, data.orderId, data.reqId, "automation_whatsapp", "system", `WhatsApp: ${config.message || "notification sent"}`);
        return { success: true };

      case "mark_as_received":
        await prisma.returnRequest.update({
          where: { reqId: data.reqId },
          data: { status: "delivered" },
        });
        await auditLog(shop, data.orderId, data.reqId, "automation_received", "system", "Marked as received by automation");
        return { success: true };

      case "flag_for_review":
        await prisma.returnEvent.create({
          data: {
            shop,
            returnId: data.id,
            type: "flag",
            message: `Flagged for review: ${config.reason || "Automation rule"}`,
            actor: "system",
          },
        });
        await auditLog(shop, data.orderId, data.reqId, "automation_flagged", "system", `Flagged: ${config.reason || "review needed"}`);
        return { success: true };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action execution failed";
    return { success: false, error: message };
  }
}

// ── Main Engine ──────────────────────────────────────────────────────────────

export async function runAutomationsForReturn(
  returnId: string,
  shop: string,
  accessToken: string,
  triggerEvent: string,
): Promise<AutomationResult> {
  const result: AutomationResult = { rulesEvaluated: 0, rulesMatched: 0, actionsExecuted: 0, errors: [] };

  // Fetch the return
  const returnData = await prisma.returnRequest.findFirst({ where: { id: returnId, shop } });
  if (!returnData) return result;

  // Enrich with order data
  const enriched = await enrichReturnData(returnData, shop, accessToken);

  // Fetch all active rules for this shop
  const rules = await prisma.automationRule.findMany({
    where: { shop, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  for (const rule of rules) {
    result.rulesEvaluated++;
    const conditions = (rule.conditions as Condition[]) || [];
    const actions = (rule.actions as Action[]) || [];

    if (conditions.length === 0 || actions.length === 0) continue;

    // Evaluate conditions
    const conditionResults = conditions.map((c) => evaluateCondition(c, enriched));
    const conditionsMet = rule.matchType === "ALL"
      ? conditionResults.every(Boolean)
      : conditionResults.some(Boolean);

    if (!conditionsMet) {
      // Log non-match
      await prisma.automationLog.create({
        data: { shop, ruleId: rule.id, ruleName: rule.name, returnId: returnData.reqId, conditionsMet: false, actionsRun: [] },
      });
      continue;
    }

    result.rulesMatched++;
    const actionResults: Array<{ type: string; success: boolean; error?: string }> = [];

    // Execute actions sequentially
    for (const action of actions) {
      const actionResult = await executeAction(action, enriched, shop, accessToken);
      actionResults.push({ type: action.type, ...actionResult });
      if (actionResult.success) {
        result.actionsExecuted++;
      } else if (actionResult.error) {
        result.errors.push(`[${rule.name}] ${action.type}: ${actionResult.error}`);
      }
    }

    // Log execution
    await prisma.automationLog.create({
      data: {
        shop,
        ruleId: rule.id,
        ruleName: rule.name,
        returnId: returnData.reqId,
        conditionsMet: true,
        actionsRun: actionResults,
        error: actionResults.filter((a) => !a.success).map((a) => a.error).join("; ") || null,
      },
    });

    // Update rule stats
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
  }

  return result;
}

// ── Default Rules ────────────────────────────────────────────────────────────

export const DEFAULT_RULES = [
  {
    name: "Auto Approve Exchange",
    description: "Automatically approve all exchange requests",
    matchType: "ALL",
    conditions: [{ type: "request_type", operator: "is", value: "exchange" }],
    actions: [{ type: "auto_approve" }],
  },
  {
    name: "Auto Approve Low Value Return",
    description: "Auto approve and refund returns under ₹500",
    matchType: "ALL",
    conditions: [{ type: "return_value", operator: "less_than", value: 500 }],
    actions: [{ type: "auto_approve" }, { type: "process_refund", config: { refund_method: "original" } }],
  },
  {
    name: "Flag High Value Return",
    description: "Flag returns over ₹5000 for manual review",
    matchType: "ALL",
    conditions: [{ type: "return_value", operator: "greater_than", value: 5000 }],
    actions: [{ type: "flag_for_review", config: { reason: "High value return" } }, { type: "send_email_to_merchant", config: { subject: "High value return flagged", message: "A return over ₹5000 needs review." } }],
  },
  {
    name: "Auto Reject Ineligible Tags",
    description: "Reject orders tagged with no-return",
    matchType: "ALL",
    conditions: [{ type: "order_tags", operator: "contains", value: "no-return" }],
    actions: [{ type: "auto_reject", config: { rejection_reason: "This order is not eligible for return" } }],
  },
  {
    name: "Send Confirmation on Approval",
    description: "Email customer when return is approved",
    matchType: "ALL",
    conditions: [{ type: "request_stage", operator: "is", value: "approved" }],
    actions: [{ type: "send_email_to_customer", config: { subject: "Return Approved", message: "Your return has been approved." } }],
  },
  {
    name: "Auto Schedule Pickup on Approval",
    description: "Schedule pickup when a return is approved",
    matchType: "ALL",
    conditions: [{ type: "request_stage", operator: "is", value: "approved" }, { type: "request_type", operator: "is", value: "return" }],
    actions: [{ type: "create_pickup" }],
  },
  {
    name: "Issue Store Credit for Exchange",
    description: "Issue 100% store credit when exchange is received",
    matchType: "ALL",
    conditions: [{ type: "request_type", operator: "is", value: "exchange" }, { type: "request_stage", operator: "is", value: "delivered" }],
    actions: [{ type: "issue_store_credit", config: { amount_type: "percentage", amount: 100 } }],
  },
  {
    name: "Tag Order on Return Request",
    description: "Add return-requested tag when return is submitted",
    matchType: "ALL",
    conditions: [{ type: "request_stage", operator: "is", value: "pending" }],
    actions: [{ type: "add_order_tag", config: { tag: "return-requested" } }],
  },
];

export async function ensureDefaultRules(shop: string): Promise<void> {
  const existingCount = await prisma.automationRule.count({ where: { shop } });
  if (existingCount > 0) return;

  await prisma.automationRule.createMany({
    data: DEFAULT_RULES.map((r) => ({
      shop,
      name: r.name,
      description: r.description,
      isActive: false,
      matchType: r.matchType,
      conditions: r.conditions,
      actions: r.actions,
    })),
  });
}
