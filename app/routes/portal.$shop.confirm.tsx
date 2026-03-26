import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation, useNavigate } from "@remix-run/react";
import { useState, useMemo, useEffect, useCallback } from "react";
import prisma from "../db.server";
import { submitReturnRequest } from "../services/returns.server";

// Fee calculation — pure function, no server imports
function calculateFees(
  items: Array<{ price: string | number; qty: number; action: string }>,
  fees: { restockingFee: number; returnShippingFee: number; exchangeShippingFee: number; taxRate: number },
) {
  const returnItems = items.filter((i) => i.action === "return");
  const exchangeItems = items.filter((i) => i.action === "exchange");
  const returnTotal = returnItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );
  const exchangeTotal = exchangeItems.reduce(
    (s, i) => s + parseFloat(String(i.price || 0)) * (i.qty || 1), 0,
  );
  const itemTotal = returnTotal + exchangeTotal;
  const restockingFee = fees.restockingFee > 0
    ? Math.round(returnTotal * (fees.restockingFee / 100) * 100) / 100 : 0;
  const shippingFee = (returnItems.length > 0 ? fees.returnShippingFee : 0)
    + (exchangeItems.length > 0 ? fees.exchangeShippingFee : 0);
  const refundAmount = Math.max(0, returnTotal - restockingFee - shippingFee);
  return { itemTotal, restockingFee, shippingFee, refundAmount };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const dataParam = url.searchParams.get("data");
  if (!dataParam) throw redirect(`/portal/${params.shop}`);

  try {
    const data = JSON.parse(decodeURIComponent(dataParam));
    const shopDomain = params.shop!;

    // Load global refund mode settings
    const { getSetting } = await import("../services/settings.server");
    const isCod = data.is_cod || false;

    let refundOptions: Array<{ value: string; label: string }> = [];

    if (isCod) {
      // COD / Cash on Delivery / payment pending orders
      const codStoreCredit = await getSetting<boolean>(shopDomain, "refund_cod_store_credit", true);
      const codBankTransfer = await getSetting<boolean>(shopDomain, "refund_cod_bank_transfer", false);
      const codOther = await getSetting<boolean>(shopDomain, "refund_cod_other", false);
      if (codStoreCredit) refundOptions.push({ value: "store_credit", label: "Store Credit" });
      if (codBankTransfer) refundOptions.push({ value: "bank_transfer", label: "Bank Transfer" });
      if (codOther) refundOptions.push({ value: "other", label: "Other" });
    } else {
      // Prepaid / Online paid orders
      const prepaidStoreCredit = await getSetting<boolean>(shopDomain, "refund_prepaid_store_credit", true);
      const prepaidOriginal = await getSetting<boolean>(shopDomain, "refund_prepaid_original", true);
      if (prepaidOriginal) refundOptions.push({ value: "original", label: "Original Payment" });
      if (prepaidStoreCredit) refundOptions.push({ value: "store_credit", label: "Store Credit" });
    }

    // Fallback: if nothing enabled, show original
    if (refundOptions.length === 0) {
      refundOptions.push({ value: "original", label: "Original Payment" });
    }

    // Nudge settings
    const nudgeExchangeEnabled = await getSetting<boolean>(shopDomain, "nudge_exchange_enabled", true);
    const nudgeStoreCreditEnabled = await getSetting<boolean>(shopDomain, "nudge_store_credit_enabled", true);
    const nudgeExchangeBonus = await getSetting<number>(shopDomain, "nudge_exchange_bonus", 0);
    const nudgeStoreCreditBonus = await getSetting<number>(shopDomain, "nudge_store_credit_bonus", 0);
    const nudgeExchangeMessage = await getSetting<string>(shopDomain, "nudge_exchange_message", "");
    const nudgeStoreCreditMessage = await getSetting<string>(shopDomain, "nudge_store_credit_message", "");
    const storeCountry = await getSetting<string>(shopDomain, "store_country", "IN");

    return json({
      data, shop: shopDomain, refundOptions, isCod,
      nudgeExchangeEnabled, nudgeStoreCreditEnabled,
      nudgeExchangeBonus, nudgeStoreCreditBonus,
      nudgeExchangeMessage, nudgeStoreCreditMessage,
      storeCountry,
    });
  } catch {
    throw redirect(`/portal/${params.shop}`);
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const shopDomain = params.shop!;
  const formData = await request.formData();
  const orderDataStr = formData.get("orderData") as string;
  const refundMethod = formData.get("refundMethod") as string;
  const bankDetailsStr = formData.get("bankDetails") as string;

  let orderData;
  try {
    orderData = JSON.parse(orderDataStr);
  } catch {
    return json({ error: "Invalid data" });
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) return json({ error: "Store not found" });

  try {
    const reqId = await submitReturnRequest(shopDomain, shopRecord.accessToken, {
      orderId: orderData.id,
      orderNumber: String(orderData.order_number || orderData.name?.replace("#", "")),
      customerName: orderData.customer
        ? `${orderData.customer.first_name || ""} ${orderData.customer.last_name || ""}`.trim()
        : orderData.shipping_address?.name || "",
      customerEmail: orderData.customer?.email || orderData.email || "",
      items: orderData.selected_items,
      refundMethod,
      shippingPreference: "pickup",
      address: orderData.shipping_address,
      isCod: orderData.is_cod || false,
      daysSinceOrder: orderData.days_since || 0,
      orderTags: orderData.tags || "",
      orderLineItems: orderData.line_items || [],
      multipleReturnsMode: orderData.multiple_returns_mode || "new",
      existingRequestId: orderData.existing_request_id,
    });

    // Save bank details if provided
    if (bankDetailsStr && refundMethod === "bank_transfer") {
      try {
        const { encrypt } = await import("../utils/encryption.server");
        const encrypted = encrypt(bankDetailsStr);
        await prisma.returnRequest.update({
          where: { reqId },
          data: { bankDetails: encrypted },
        });
      } catch (e) {
        console.error("[BankDetails] encryption error:", e);
      }
    }

    return redirect(`/portal/${shopDomain}/tracking/${reqId}`);
  } catch (e: any) {
    return json({ error: e.message || "Failed to submit return request" });
  }
};

export default function PortalConfirm() {
  const {
    data, shop, refundOptions, isCod,
    nudgeExchangeEnabled, nudgeStoreCreditEnabled,
    nudgeExchangeBonus, nudgeStoreCreditBonus,
    nudgeExchangeMessage, nudgeStoreCreditMessage,
    storeCountry,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const nav = useNavigate();
  const [refundMethod, setRefundMethod] = useState((refundOptions as any[])[0]?.value || "original");

  // Nudge dismissal
  const [exchangeNudgeDismissed, setExchangeNudgeDismissed] = useState(false);
  const [creditNudgeDismissed, setCreditNudgeDismissed] = useState(false);

  // Bank details state
  const country = (storeCountry || "IN").toUpperCase();
  const isIndia = country === "IN";
  const isUAE = ["AE", "SA", "QA", "KW", "BH", "OM"].includes(country);
  const [bankForm, setBankForm] = useState({
    type: "bank" as "bank" | "upi",
    accountHolderName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    bankName: "",
    accountType: isIndia ? "savings" : isUAE ? "current" : "checking",
    upiId: "",
    ibanNumber: "",
    swiftCode: "",
    routingNumber: "",
    country,
  });
  const [ifscVerified, setIfscVerified] = useState(false);
  const [ifscBranch, setIfscBranch] = useState("");

  const ub = (key: string, val: string) => setBankForm((p) => ({ ...p, [key]: val }));

  // IFSC lookup
  useEffect(() => {
    if (!isIndia || bankForm.ifscCode.length !== 11) { setIfscVerified(false); return; }
    const ifsc = bankForm.ifscCode.toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { setIfscVerified(false); return; }
    fetch(`https://ifsc.razorpay.com/${ifsc}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setBankForm((p) => ({ ...p, bankName: d.BANK || p.bankName }));
          setIfscBranch(`${d.BRANCH || ""}, ${d.CITY || ""}`);
          setIfscVerified(true);
        } else { setIfscVerified(false); }
      })
      .catch(() => setIfscVerified(false));
  }, [bankForm.ifscCode, isIndia]);

  // Bank form validation
  const isBankFormValid = useCallback(() => {
    if (refundMethod !== "bank_transfer") return true;
    const f = bankForm;
    if (!f.accountHolderName) return false;
    if (isIndia) {
      if (f.type === "upi") return f.upiId.includes("@");
      return f.accountNumber.length >= 6 && f.accountNumber === f.confirmAccountNumber
        && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifscCode.toUpperCase()) && f.bankName.length > 0;
    }
    if (isUAE) return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(f.ibanNumber) && f.bankName.length > 0 && f.swiftCode.length > 0;
    return f.accountNumber.length >= 4 && f.bankName.length > 0;
  }, [bankForm, refundMethod, isIndia, isUAE]);

  const bankDetailsJson = JSON.stringify({
    type: bankForm.type,
    accountHolderName: bankForm.accountHolderName,
    accountNumber: bankForm.accountNumber,
    ifscCode: bankForm.ifscCode,
    bankName: bankForm.bankName,
    accountType: bankForm.accountType,
    upiId: bankForm.upiId,
    ibanNumber: bankForm.ibanNumber,
    swiftCode: bankForm.swiftCode,
    routingNumber: bankForm.routingNumber,
    country: bankForm.country,
  });

  const selectedItems = data.selected_items || [];
  const totalAmount = selectedItems.reduce(
    (s: number, i: any) => s + parseFloat(i.price || 0) * (parseInt(i.qty) || 1),
    0,
  );
  const address = data.shipping_address || {};

  // Determine request type
  const hasReturn = selectedItems.some((i: any) => i.action === "return");
  const hasExchange = selectedItems.some((i: any) => i.action === "exchange");
  const isExchangeOnly = hasExchange && !hasReturn;

  // Currency symbol from store
  const currencyCode = data.currency || "INR";
  const currencySymbol: Record<string, string> = {
    INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", JPY: "¥", SGD: "S$", AED: "AED ",
  };
  const cs = currencySymbol[currencyCode] || currencyCode + " ";

  // Calculate fees from policy settings
  const fees = data.fees || { restockingFee: 0, returnShippingFee: 0, exchangeShippingFee: 0, taxRate: 0 };
  const feeBreakdown = useMemo(
    () => calculateFees(selectedItems, fees),
    [selectedItems, fees],
  );
  const hasFees = feeBreakdown.restockingFee > 0 || feeBreakdown.shippingFee > 0;

  return (
    <>
      {/* Breadcrumb navigation */}
      <div className="portal-breadcrumbs">
        <span className="portal-breadcrumb done" onClick={() => nav(`/portal/${shop}`)}>
          Find Order
        </span>
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb done" onClick={() => nav(-hasExchange ? 2 : 1)}>
          Select Items
        </span>
        {hasExchange && (
          <>
            <span className="portal-breadcrumb-sep">›</span>
            <span className="portal-breadcrumb done" onClick={() => nav(-1)}>
              Exchange
            </span>
          </>
        )}
        <span className="portal-breadcrumb-sep">›</span>
        <span className="portal-breadcrumb active">Confirm</span>
      </div>

      <div className="portal-card">
        <h2>Review & Confirm</h2>

        {actionData?.error && (
          <div className="portal-error">{actionData.error}</div>
        )}

        {/* Items summary */}
        <h3 style={{ marginTop: 8 }}>Items</h3>
        {selectedItems.map((item: any, idx: number) => (
          <div className="portal-item" key={idx}>
            {item.image_url && (
              <img className="portal-item-image" src={item.image_url} alt={item.title} />
            )}
            <div className="portal-item-info">
              <div className="portal-item-title">{item.title}</div>
              <div className="portal-item-meta">
                {item.variant_title || ""} &middot; Qty: {item.qty || 1} &middot;{" "}
                <span style={{ textTransform: "capitalize" }}>{item.action}</span>
              </div>
              {item.exchange_variant_title && (
                <div className="portal-item-meta">
                  Exchange to: {item.exchange_variant_title}
                </div>
              )}
              {item.reason && (
                <div className="portal-item-meta">Reason: {item.reason}</div>
              )}
            </div>
            <div className="portal-item-price">{cs}{item.price}</div>
          </div>
        ))}

        {/* Fee breakdown */}
        {hasReturn && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--portal-border)", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span>Item total</span>
              <span>{cs}{feeBreakdown.itemTotal.toLocaleString("en-IN")}</span>
            </div>
            {feeBreakdown.restockingFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4, color: "var(--portal-accent)" }}>
                <span>Restocking fee ({fees.restockingFee}%)</span>
                <span>- {cs}{feeBreakdown.restockingFee.toLocaleString("en-IN")}</span>
              </div>
            )}
            {feeBreakdown.shippingFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4, color: "var(--portal-accent)" }}>
                <span>Shipping fee</span>
                <span>- {cs}{feeBreakdown.shippingFee.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, marginTop: 8, borderTop: "1px solid var(--portal-border)", paddingTop: 8 }}>
              <span>Refund amount</span>
              <span>{cs}{feeBreakdown.refundAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}
        {!hasReturn && (
          <div style={{ textAlign: "right", fontWeight: 700, margin: "12px 0", fontSize: 16 }}>
            Total: {cs}{totalAmount.toLocaleString("en-IN")}
          </div>
        )}
      </div>

      {/* Store Credit Nudge */}
      {!isExchangeOnly && nudgeStoreCreditEnabled && !creditNudgeDismissed
        && refundMethod !== "store_credit" && (refundMethod === "original" || refundMethod === "bank_transfer") && (
        <div className="nudge-card nudge-credit">
          <button className="nudge-dismiss" onClick={() => setCreditNudgeDismissed(true)}>×</button>
          <div className="nudge-title">Get MORE back with Store Credit!</div>
          <div className="nudge-amount-comparison">
            <span>Refund: {cs}{feeBreakdown.refundAmount.toLocaleString("en-IN")}</span>
            {Number(nudgeStoreCreditBonus) > 0 && (
              <>
                <span>→</span>
                <span style={{ fontWeight: 700 }}>Store credit: {cs}{(feeBreakdown.refundAmount + Number(nudgeStoreCreditBonus)).toLocaleString("en-IN")}</span>
                <span className="nudge-bonus">+{cs}{Number(nudgeStoreCreditBonus)} BONUS</span>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#6B7280" }}>
            Store credit never expires and can be used on any future order.
            {nudgeStoreCreditMessage ? ` ${nudgeStoreCreditMessage}` : ""}
          </p>
          <div className="nudge-actions">
            <button className="portal-btn-secondary portal-btn" style={{ flex: 1, padding: "8px 12px", fontSize: 13 }} onClick={() => setCreditNudgeDismissed(true)} type="button">Keep Refund</button>
            <button className="portal-btn portal-btn-primary" style={{ flex: 1, padding: "8px 12px", fontSize: 13 }} onClick={() => { setRefundMethod("store_credit"); setCreditNudgeDismissed(true); }} type="button">Switch to Store Credit →</button>
          </div>
        </div>
      )}

      {/* Refund Method - only show when there are return items */}
      {!isExchangeOnly && (
        <div className="portal-card">
          <h3>Refund Method</h3>
          {isCod && (
            <p style={{ fontSize: 12, color: "var(--portal-accent)", fontWeight: 600, marginBottom: 8 }}>
              COD / Payment pending order
            </p>
          )}
          <div className="portal-toggle-group" style={{ marginTop: 8 }}>
            {(refundOptions as any[]).map((opt: any) => (
              <button
                key={opt.value}
                className={`portal-toggle ${refundMethod === opt.value ? "active" : ""}`}
                onClick={() => setRefundMethod(opt.value)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "var(--portal-text-muted)", marginTop: 8 }}>
            {refundMethod === "original"
              ? "Refund will be processed to your original payment method."
              : refundMethod === "store_credit"
                ? `Receive store credit${Number(nudgeStoreCreditBonus) > 0 ? ` (+ ${cs}${nudgeStoreCreditBonus} bonus)` : ""}. Can be used on future purchases.`
                : refundMethod === "bank_transfer"
                  ? "Refund will be transferred to your bank account."
                  : "Refund will be processed via an alternative method."}
          </p>

          {/* Bank Transfer Details Form */}
          <div className={`bank-details-form ${refundMethod === "bank_transfer" ? "expanded" : ""}`}>
            <div style={{ paddingTop: 16 }}>
              <p style={{ fontSize: 12, color: "var(--portal-text-muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🔒</span> Your bank details are encrypted and only used for processing your refund.
              </p>

              {isIndia && (
                <div style={{ marginBottom: 12 }}>
                  <div className="portal-toggle-group">
                    <button className={`portal-toggle ${bankForm.type === "bank" ? "active" : ""}`} onClick={() => ub("type", "bank")} type="button">Bank Account</button>
                    <button className={`portal-toggle ${bankForm.type === "upi" ? "active" : ""}`} onClick={() => ub("type", "upi")} type="button">UPI</button>
                  </div>
                </div>
              )}

              {bankForm.type === "upi" && isIndia ? (
                <>
                  <div className="portal-field">
                    <label className="portal-label">Account Holder Name *</label>
                    <input className="portal-input" value={bankForm.accountHolderName} onChange={(e) => ub("accountHolderName", e.target.value)} placeholder="Full name as on account" />
                  </div>
                  <div className="portal-field">
                    <label className="portal-label">UPI ID *</label>
                    <input className="portal-input" value={bankForm.upiId} onChange={(e) => ub("upiId", e.target.value)} placeholder="username@bankcode or phone@upi" />
                    {bankForm.upiId && !bankForm.upiId.includes("@") && (
                      <p style={{ fontSize: 12, color: "var(--portal-accent)", marginTop: 4 }}>UPI ID must contain @</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="portal-field">
                    <label className="portal-label">Account Holder Name *</label>
                    <input className="portal-input" value={bankForm.accountHolderName} onChange={(e) => ub("accountHolderName", e.target.value)} placeholder="Full name as on account" />
                  </div>

                  {isIndia && (
                    <>
                      <div className="bank-field-row">
                        <div className="portal-field">
                          <label className="portal-label">Account Number *</label>
                          <input className="portal-input" value={bankForm.accountNumber} onChange={(e) => ub("accountNumber", e.target.value)} placeholder="Account number" type="text" inputMode="numeric" />
                        </div>
                        <div className="portal-field">
                          <label className="portal-label">Confirm Account Number *</label>
                          <input className="portal-input" value={bankForm.confirmAccountNumber} onChange={(e) => ub("confirmAccountNumber", e.target.value)} placeholder="Re-enter account number" type="text" inputMode="numeric" />
                          {bankForm.confirmAccountNumber && bankForm.accountNumber !== bankForm.confirmAccountNumber && (
                            <p style={{ fontSize: 12, color: "var(--portal-accent)", marginTop: 4 }}>Account numbers do not match</p>
                          )}
                        </div>
                      </div>
                      <div className="bank-field-row">
                        <div className="portal-field">
                          <label className="portal-label">IFSC Code *</label>
                          <input className="portal-input" value={bankForm.ifscCode} onChange={(e) => ub("ifscCode", e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" maxLength={11} style={{ textTransform: "uppercase" }} />
                          {ifscVerified && <div className="bank-verified">✓ Verified: {bankForm.bankName}, {ifscBranch}</div>}
                        </div>
                        <div className="portal-field">
                          <label className="portal-label">Bank Name *</label>
                          <input className="portal-input" value={bankForm.bankName} onChange={(e) => ub("bankName", e.target.value)} placeholder="Bank name" />
                        </div>
                      </div>
                      <div className="portal-field">
                        <label className="portal-label">Account Type *</label>
                        <select className="portal-select" value={bankForm.accountType} onChange={(e) => ub("accountType", e.target.value)}>
                          <option value="savings">Savings</option>
                          <option value="current">Current</option>
                          <option value="nro">NRO</option>
                          <option value="nre">NRE</option>
                        </select>
                      </div>
                    </>
                  )}

                  {isUAE && (
                    <>
                      <div className="portal-field">
                        <label className="portal-label">IBAN Number *</label>
                        <input className="portal-input" value={bankForm.ibanNumber} onChange={(e) => ub("ibanNumber", e.target.value.toUpperCase())} placeholder="e.g. AE070331234567890123456" style={{ textTransform: "uppercase" }} />
                        {bankForm.ibanNumber && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(bankForm.ibanNumber) && (
                          <p style={{ fontSize: 12, color: "var(--portal-accent)", marginTop: 4 }}>Invalid IBAN format</p>
                        )}
                      </div>
                      <div className="bank-field-row">
                        <div className="portal-field">
                          <label className="portal-label">Bank Name *</label>
                          <input className="portal-input" value={bankForm.bankName} onChange={(e) => ub("bankName", e.target.value)} placeholder="Bank name" />
                        </div>
                        <div className="portal-field">
                          <label className="portal-label">BIC/SWIFT Code *</label>
                          <input className="portal-input" value={bankForm.swiftCode} onChange={(e) => ub("swiftCode", e.target.value.toUpperCase())} placeholder="SWIFT code" style={{ textTransform: "uppercase" }} />
                        </div>
                      </div>
                      <div className="portal-field">
                        <label className="portal-label">Account Type *</label>
                        <select className="portal-select" value={bankForm.accountType} onChange={(e) => ub("accountType", e.target.value)}>
                          <option value="current">Current</option>
                          <option value="savings">Savings</option>
                        </select>
                      </div>
                    </>
                  )}

                  {!isIndia && !isUAE && (
                    <>
                      <div className="bank-field-row">
                        <div className="portal-field">
                          <label className="portal-label">Account Number *</label>
                          <input className="portal-input" value={bankForm.accountNumber} onChange={(e) => ub("accountNumber", e.target.value)} placeholder="Account number" />
                        </div>
                        <div className="portal-field">
                          <label className="portal-label">Routing Number</label>
                          <input className="portal-input" value={bankForm.routingNumber} onChange={(e) => ub("routingNumber", e.target.value)} placeholder="9-digit routing number" maxLength={9} inputMode="numeric" />
                        </div>
                      </div>
                      <div className="bank-field-row">
                        <div className="portal-field">
                          <label className="portal-label">Bank Name *</label>
                          <input className="portal-input" value={bankForm.bankName} onChange={(e) => ub("bankName", e.target.value)} placeholder="Bank name" />
                        </div>
                        <div className="portal-field">
                          <label className="portal-label">SWIFT/BIC</label>
                          <input className="portal-input" value={bankForm.swiftCode} onChange={(e) => ub("swiftCode", e.target.value.toUpperCase())} placeholder="SWIFT code" style={{ textTransform: "uppercase" }} />
                        </div>
                      </div>
                      <div className="portal-field">
                        <label className="portal-label">Account Type *</label>
                        <select className="portal-select" value={bankForm.accountType} onChange={(e) => ub("accountType", e.target.value)}>
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exchange info */}
      {hasExchange && (
        <div className="portal-card">
          <h3>Exchange Details</h3>
          {selectedItems
            .filter((i: any) => i.action === "exchange")
            .map((item: any, idx: number) => (
              <div key={idx} style={{ marginTop: idx > 0 ? 12 : 4 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</p>
                <p style={{ fontSize: 13, color: "var(--portal-text-muted)" }}>
                  Current: {item.variant_title || "Default"} → Replacement:{" "}
                  {item.exchange_variant_title || "Same variant"}
                </p>
              </div>
            ))}
          <p style={{ fontSize: 13, color: "var(--portal-text-muted)", marginTop: 12 }}>
            Your exchange order will be created once the original items are picked up.
          </p>
        </div>
      )}

      {/* Pickup Address */}
      <div className="portal-card">
        <h3>Pickup Address</h3>
        <p style={{ fontSize: 14, marginTop: 4 }}>
          {address.name && <>{address.name}<br /></>}
          {address.address1 && <>{address.address1}<br /></>}
          {address.address2 && <>{address.address2}<br /></>}
          {address.city && <>{address.city}, </>}
          {address.province && <>{address.province} </>}
          {address.zip && <>{address.zip}<br /></>}
          {address.phone && <>Phone: {address.phone}</>}
        </p>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          className="portal-btn"
          onClick={() => nav(-1)}
          type="button"
          style={{ flex: 1 }}
        >
          ← Back
        </button>
        <Form method="post" style={{ flex: 2 }}>
          <input type="hidden" name="orderData" value={JSON.stringify(data)} />
          <input type="hidden" name="refundMethod" value={refundMethod} />
          {refundMethod === "bank_transfer" && (
            <input type="hidden" name="bankDetails" value={bankDetailsJson} />
          )}
          <button
            className="portal-btn portal-btn-primary"
            type="submit"
            disabled={isLoading || !isBankFormValid()}
            style={{ width: "100%" }}
          >
            {isLoading ? "Submitting..." : "Submit Return Request"}
          </button>
        </Form>
      </div>
    </>
  );
}
