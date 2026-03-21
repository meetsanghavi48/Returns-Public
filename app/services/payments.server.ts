import crypto from "crypto";
import prisma from "../db.server";
import { getShopConfig } from "./settings.server";
import { uid } from "./shopify.server";

function getEasebuzzBase(env: string) {
  return env === "test"
    ? "https://testpay.easebuzz.in"
    : "https://pay.easebuzz.in";
}

// Generate Easebuzz hash for payment initiation
export function ebHash(
  params: Record<string, string>,
  salt: string,
): string {
  const str = [
    params.key,
    params.txnid,
    params.amount,
    params.productinfo,
    params.firstname,
    params.email,
    params.udf1 || "",
    params.udf2 || "",
    params.udf3 || "",
    params.udf4 || "",
    params.udf5 || "",
    "",
    "",
    "",
    "",
    "",
    salt,
  ].join("|");
  return crypto.createHash("sha512").update(str).digest("hex");
}

// Verify Easebuzz response hash
export function ebVerify(
  params: Record<string, string>,
  salt: string,
): string {
  const str = [
    salt,
    params.status,
    params.udf5 || "",
    params.udf4 || "",
    params.udf3 || "",
    params.udf2 || "",
    params.udf1 || "",
    params.email,
    params.firstname,
    params.productinfo,
    params.amount,
    params.txnid,
    params.key,
  ].join("|");
  return crypto.createHash("sha512").update(str).digest("hex");
}

// Initiate an Easebuzz payment (for exchange price difference)
export async function initiatePayment(
  shop: string,
  data: {
    orderId: string;
    reqId: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    callbackUrl: string;
  },
) {
  const shopConfig = await getShopConfig(shop);
  if (!shopConfig?.easebuzzKey || !shopConfig?.easebuzzSalt) {
    throw new Error("Easebuzz not configured for this shop");
  }

  const txnid = `EB${uid().toUpperCase()}`;
  const params: Record<string, string> = {
    key: shopConfig.easebuzzKey,
    txnid,
    amount: data.amount.toFixed(2),
    productinfo: `Exchange payment for order ${data.orderId}`,
    firstname: data.customerName || "Customer",
    email: data.customerEmail || "noreply@example.com",
    phone: data.customerPhone || "9999999999",
    surl: data.callbackUrl + "/success",
    furl: data.callbackUrl + "/failure",
    udf1: data.reqId,
    udf2: data.orderId,
    udf3: shop,
  };
  params.hash = ebHash(params, shopConfig.easebuzzSalt);

  // Save payment record
  await prisma.payment.create({
    data: {
      shop,
      txnid,
      reqId: data.reqId,
      orderId: data.orderId,
      amount: data.amount,
      status: "pending",
    },
  });

  const base = getEasebuzzBase(shopConfig.easebuzzEnv);
  return { payUrl: `${base}/payment/initiateLink`, params, txnid };
}

// Handle payment callback
export async function handlePaymentCallback(
  txnid: string,
  responseBody: Record<string, string>,
  isSuccess: boolean,
) {
  const payment = await prisma.payment.findUnique({ where: { txnid } });
  if (!payment) throw new Error("Payment not found");

  const shopConfig = await getShopConfig(payment.shop);
  if (!shopConfig?.easebuzzSalt) throw new Error("Shop config not found");

  // Verify hash
  const expectedHash = ebVerify(responseBody, shopConfig.easebuzzSalt);
  if (responseBody.hash !== expectedHash) {
    throw new Error("Hash verification failed");
  }

  await prisma.payment.update({
    where: { txnid },
    data: {
      status: isSuccess ? "success" : "failed",
      txnResponse: responseBody as any,
    },
  });

  return { shop: payment.shop, reqId: payment.reqId, orderId: payment.orderId };
}
