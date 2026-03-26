// Shared types and definitions for automation system (client + server safe)

export interface Condition {
  type: string;
  operator?: string;
  value?: string | number;
}

export interface Action {
  type: string;
  config?: Record<string, string | number>;
}

export const CONDITION_TYPES = [
  { key: "request_type", label: "Request Type", operators: ["is", "is_not"], valueType: "select" as const,
    options: [{ label: "Return", value: "return" }, { label: "Exchange", value: "exchange" }, { label: "Mixed (Return + Exchange)", value: "mixed" }] },
  { key: "reason", label: "Return Reason", operators: ["is", "is_not", "contains"], valueType: "text" as const },
  { key: "request_stage", label: "Request Stage", operators: ["is", "is_not"], valueType: "select" as const,
    options: [
      { label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Rejected", value: "rejected" },
      { label: "Pickup Scheduled", value: "pickup_scheduled" }, { label: "In Transit", value: "in_transit" },
      { label: "Delivered", value: "delivered" }, { label: "Refunded", value: "refunded" }, { label: "Exchanged", value: "exchanged" },
      { label: "Archived", value: "archived" },
    ] },
  { key: "shipment_status", label: "Shipment Status", operators: ["is", "is_not"], valueType: "select" as const,
    options: [
      { label: "Not Scheduled", value: "not_scheduled" }, { label: "Pickup Scheduled", value: "pickup_scheduled" },
      { label: "Picked Up", value: "picked_up" }, { label: "In Transit", value: "in_transit" },
      { label: "Out for Delivery", value: "out_for_delivery" }, { label: "Delivered", value: "delivered" },
      { label: "Failed", value: "failed" }, { label: "RTO (Returned to Origin)", value: "rto" },
    ] },
  { key: "order_type", label: "Order Type (Prepaid / COD)", operators: ["is"], valueType: "select" as const,
    options: [{ label: "Prepaid", value: "prepaid" }, { label: "COD", value: "cod" }] },
  { key: "order_tags", label: "Order Tags", operators: ["contains", "does_not_contain"], valueType: "text" as const },
  { key: "product_tags", label: "Product Tags", operators: ["contains", "does_not_contain"], valueType: "text" as const },
  { key: "order_value", label: "Order Value", operators: ["greater_than", "less_than", "equals"], valueType: "number" as const },
  { key: "return_value", label: "Return Item Value", operators: ["greater_than", "less_than", "equals"], valueType: "number" as const },
  { key: "item_count", label: "Number of Items", operators: ["greater_than", "less_than", "equals"], valueType: "number" as const },
  { key: "requested_refund_mode", label: "Refund Method", operators: ["is", "is_not"], valueType: "select" as const,
    options: [
      { label: "Original Payment", value: "original" }, { label: "Store Credit", value: "store_credit" },
      { label: "Bank Transfer", value: "bank_transfer" },
    ] },
  { key: "customer_email", label: "Customer Email", operators: ["is", "is_not", "contains"], valueType: "text" as const },
  { key: "days_since_order", label: "Days Since Order", operators: ["greater_than", "less_than", "equals"], valueType: "number" as const },
  { key: "return_count_for_customer", label: "Customer Return Count", operators: ["greater_than", "less_than", "equals"], valueType: "number" as const },
  { key: "inspection_note", label: "Inspection Note", operators: ["contains", "does_not_contain", "is_empty", "is_not_empty"], valueType: "text" as const },
];

export const ACTION_TYPES = [
  { key: "auto_approve", label: "Auto Approve Request", configFields: [] },
  { key: "auto_reject", label: "Auto Reject Request", configFields: [{ key: "rejection_reason", label: "Rejection Reason", type: "text" }] },
  { key: "create_pickup", label: "Schedule Pickup", configFields: [] },
  { key: "process_refund", label: "Process Refund", configFields: [{ key: "refund_method", label: "Refund Method", type: "select",
    options: ["original", "store_credit"] }] },
  { key: "issue_store_credit", label: "Issue Store Credit (Gift Card)", configFields: [
    { key: "amount_type", label: "Amount Type", type: "select", options: ["full", "fixed", "percentage"] },
    { key: "amount", label: "Amount (for fixed/percentage)", type: "number" },
  ] },
  { key: "update_return_status", label: "Change Status", configFields: [{ key: "new_status", label: "New Status", type: "select",
    options: ["pending", "approved", "rejected", "pickup_scheduled", "in_transit", "delivered", "refunded", "exchanged", "archived"] }] },
  { key: "add_order_tag", label: "Add Tag to Shopify Order", configFields: [{ key: "tag", label: "Tag (e.g. return-flagged)", type: "text" }] },
  { key: "remove_order_tag", label: "Remove Tag from Shopify Order", configFields: [{ key: "tag", label: "Tag to remove", type: "text" }] },
  { key: "add_internal_note", label: "Add Internal Note", configFields: [{ key: "note", label: "Note", type: "textarea" }] },
  { key: "send_email_to_customer", label: "Send Email to Customer", configFields: [
    { key: "subject", label: "Subject", type: "text" }, { key: "message", label: "Message body", type: "textarea" },
  ] },
  { key: "send_email_to_merchant", label: "Send Email to Store Owner", configFields: [
    { key: "subject", label: "Subject", type: "text" }, { key: "message", label: "Message body", type: "textarea" },
  ] },
  { key: "assign_logistics", label: "Assign Logistics Provider", configFields: [{ key: "logistics_key", label: "Provider key (e.g. delhivery, shiprocket)", type: "text" }] },
  { key: "mark_as_received", label: "Mark as Received at Warehouse", configFields: [] },
  { key: "flag_for_review", label: "Flag for Manual Review", configFields: [{ key: "reason", label: "Reason for flagging", type: "text" }] },
];
