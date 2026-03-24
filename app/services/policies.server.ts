import { getAllSettings, getSetting } from "./settings.server";
import prisma from "../db.server";

export interface PolicyCheckResult {
  eligible: boolean;
  errors: string[];
  warnings: string[];
  fees: {
    restockingFee: number;
    returnShippingFee: number;
    exchangeShippingFee: number;
    taxRate: number;
  };
  // Flags for UI behavior
  exchangeAllowed: boolean;
  exchangeOtherProducts: boolean;
  multipleReturnsMode: "new" | "append" | "blocked";
  existingRequestId?: string;
  // Per-item tag restrictions (comma-separated blocked tags)
  blockedReturnTags: string[];
  blockedExchangeTags: string[];
}

/**
 * Validate whether an order is eligible for return/exchange based on all policy settings.
 * Called from portal order lookup to block ineligible orders early.
 */
export async function validateOrderEligibility(
  shop: string,
  order: {
    id: string;
    order_number: number;
    tags: string;
    financial_status: string;
    created_at?: string;
    total_price?: string;
    discount_codes?: Array<{ code: string }>;
    fulfillments?: Array<{ status: string }>;
    line_items?: any[];
  },
  daysSinceOrder: number,
): Promise<PolicyCheckResult> {
  const settings = await getAllSettings(shop);
  const errors: string[] = [];
  const warnings: string[] = [];

  const get = <T>(key: string, def: T): T => {
    const v = settings[key];
    return v !== undefined && v !== null && v !== "" ? (v as T) : def;
  };

  // --- Return Window ---
  const returnWindowDays = get<number>("return_window_days", 30);
  if (daysSinceOrder > returnWindowDays) {
    errors.push(`This order is ${daysSinceOrder} days old. The return window is ${returnWindowDays} days.`);
  }

  // --- Exchange Window ---
  const exchangeWindowDays = get<number>("exchange_window_days", 30);
  const exchangeAllowed = daysSinceOrder <= exchangeWindowDays;

  // --- Restrict by order value ---
  const orderTotal = parseFloat(order.total_price || "0");

  const minValue = get<number>("restrict_return_min_value", 0);
  if (minValue > 0 && orderTotal < minValue) {
    errors.push(`Orders below ${minValue} are not eligible for returns.`);
  }

  const maxValue = get<number>("restrict_return_max_value", 0);
  if (maxValue > 0 && orderTotal > maxValue) {
    errors.push(`Orders above ${maxValue} are not eligible for returns.`);
  }

  // --- Restrict by product tags (per-item, not per-order) ---
  // Tag restrictions are enforced at item selection level, not here.
  // We pass blocked tags through so the UI can disable individual items.
  const restrictReturnTags = get<string>("restrict_return_tags", "");

  // --- Restrict by discount codes ---
  const restrictDiscountCodes = get<boolean>("restrict_return_discount_codes", false);
  const blockedDiscountCodes = get<string>("restrict_return_discount_code_list", "");
  if (restrictDiscountCodes && blockedDiscountCodes && order.discount_codes?.length) {
    const blocked = blockedDiscountCodes.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
    const orderCodes = order.discount_codes.map((dc) => dc.code.toLowerCase());
    const matchedCode = blocked.find((bc: string) => orderCodes.includes(bc));
    if (matchedCode) {
      errors.push(`Orders with discount code "${matchedCode}" are not eligible for returns.`);
    }
  }

  // --- Restrict undelivered orders ---
  const restrictUndelivered = get<boolean>("restrict_return_undelivered", false);
  if (restrictUndelivered) {
    const isDelivered = (order.fulfillments || []).some(
      (f: any) => f.status === "success" || f.status === "delivered",
    );
    if (!isDelivered) {
      errors.push(`Only delivered orders are eligible for returns. This order has not been delivered yet.`);
    }
  }

  // --- Restrict exchanges by value ---
  const exchMinValue = get<number>("restrict_exchange_min_value", 0);
  const exchMaxValue = get<number>("restrict_exchange_max_value", 0);

  // --- Restrict exchanges by tags (per-item, enforced in UI) ---
  const restrictExchTags = get<string>("restrict_exchange_tags", "");

  // --- Restrict exchanges on undelivered ---
  const restrictExchUndelivered = get<boolean>("restrict_exchange_undelivered", false);

  // --- Exchange with other products ---
  const exchangeOtherProducts = get<boolean>("exchange_allow_other_products", true);

  // --- Multiple returns logic ---
  const allowMultipleReturns = get<boolean>("allow_multiple_returns", true);

  const existingRequests = await prisma.returnRequest.findMany({
    where: {
      shop,
      orderId: String(order.id),
      status: { notIn: ["archived", "rejected"] },
    },
    orderBy: { submittedAt: "desc" },
  });

  let multipleReturnsMode: "new" | "append" | "blocked" = "new";
  let existingRequestId: string | undefined;

  if (existingRequests.length > 0) {
    if (!allowMultipleReturns) {
      // Block entirely
      multipleReturnsMode = "blocked";
      existingRequestId = existingRequests[0].reqId;
      errors.push("A return request has already been submitted for this order.");
    } else {
      // Check if any request is still pending/approved (not yet picked up)
      const pendingRequest = existingRequests.find(
        (r) => r.status === "pending" || r.status === "approved",
      );
      if (pendingRequest) {
        // Append to existing request
        multipleReturnsMode = "append";
        existingRequestId = pendingRequest.reqId;
      } else {
        // All requests are picked up or beyond — create new
        multipleReturnsMode = "new";
      }
    }
  }

  // --- Fees ---
  const restockingFeePct = get<number>("restocking_fee_pct", 0);
  const returnShippingFee = get<number>("return_shipping_fee", 0);
  const exchangeShippingFee = get<number>("exchange_shipping_fee", 0);
  const taxRate = get<number>("tax_rate_pct", 0);

  return {
    eligible: errors.length === 0,
    errors,
    warnings,
    fees: {
      restockingFee: restockingFeePct,
      returnShippingFee,
      exchangeShippingFee,
      taxRate,
    },
    exchangeAllowed,
    exchangeOtherProducts,
    multipleReturnsMode,
    existingRequestId,
    blockedReturnTags: restrictReturnTags ? restrictReturnTags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
    blockedExchangeTags: restrictExchTags ? restrictExchTags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
  };
}

/**
 * Validate exchange-specific eligibility for selected items.
 * Called from item selection page when customer picks "exchange".
 */
export async function validateExchangeEligibility(
  shop: string,
  order: { id: string; tags: string; total_price?: string; fulfillments?: any[] },
  daysSinceOrder: number,
): Promise<{ allowed: boolean; errors: string[] }> {
  const settings = await getAllSettings(shop);
  const errors: string[] = [];

  const get = <T>(key: string, def: T): T => {
    const v = settings[key];
    return v !== undefined && v !== null && v !== "" ? (v as T) : def;
  };

  const exchangeWindowDays = get<number>("exchange_window_days", 30);
  if (daysSinceOrder > exchangeWindowDays) {
    errors.push(`Exchange window of ${exchangeWindowDays} days has expired.`);
  }

  const orderTotal = parseFloat(order.total_price || "0");
  const exchMinValue = get<number>("restrict_exchange_min_value", 0);
  if (exchMinValue > 0 && orderTotal < exchMinValue) {
    errors.push(`Orders below ${exchMinValue} are not eligible for exchanges.`);
  }

  const exchMaxValue = get<number>("restrict_exchange_max_value", 0);
  if (exchMaxValue > 0 && orderTotal > exchMaxValue) {
    errors.push(`Orders above ${exchMaxValue} are not eligible for exchanges.`);
  }

  const restrictExchTags = get<string>("restrict_exchange_tags", "");
  if (restrictExchTags) {
    const blockedTags = restrictExchTags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    const orderTags = (order.tags || "").split(",").map((t: string) => t.trim().toLowerCase());
    const allProductTags: string[] = [];
    for (const li of (order.line_items || [])) {
      if (li.product_tags) {
        const ptags = (typeof li.product_tags === "string" ? li.product_tags : "")
          .split(",").map((t: string) => t.trim().toLowerCase());
        allProductTags.push(...ptags);
      }
    }
    if (blockedTags.some((bt: string) => orderTags.includes(bt) || allProductTags.includes(bt))) {
      errors.push("This order contains products that are not eligible for exchanges.");
    }
  }

  const restrictExchUndelivered = get<boolean>("restrict_exchange_undelivered", false);
  if (restrictExchUndelivered) {
    const isDelivered = (order.fulfillments || []).some(
      (f: any) => f.status === "success" || f.status === "delivered",
    );
    if (!isDelivered) {
      errors.push("Only delivered orders are eligible for exchanges.");
    }
  }

  return { allowed: errors.length === 0, errors };
}

/**
 * Calculate fee breakdown for the confirm page.
 */
export function calculateFees(
  items: Array<{ price: string | number; qty: number; action: string }>,
  fees: PolicyCheckResult["fees"],
): {
  itemTotal: number;
  restockingFee: number;
  shippingFee: number;
  tax: number;
  refundAmount: number;
} {
  const returnItems = items.filter((i) => i.action === "return");
  const exchangeItems = items.filter((i) => i.action === "exchange");

  const returnTotal = returnItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );
  const exchangeTotal = exchangeItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );

  const itemTotal = returnTotal + exchangeTotal;

  // Restocking fee applies to return items only
  const restockingFee = fees.restockingFee > 0
    ? Math.round(returnTotal * (fees.restockingFee / 100) * 100) / 100
    : 0;

  // Shipping fee — return shipping for returns, exchange shipping for exchanges
  const shippingFee = (returnItems.length > 0 ? fees.returnShippingFee : 0)
    + (exchangeItems.length > 0 ? fees.exchangeShippingFee : 0);

  // Tax on refund
  const tax = fees.taxRate > 0
    ? Math.round(returnTotal * (fees.taxRate / 100) * 100) / 100
    : 0;

  // Refund = item total - restocking - shipping + tax (if inclusive)
  const refundAmount = Math.max(0, returnTotal - restockingFee - shippingFee);

  return { itemTotal, restockingFee, shippingFee, tax, refundAmount };
}
