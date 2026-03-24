import { paymentRegistry } from "./registry";

// Tier 1 — Real implementations
import { RazorpayAdapter } from "./razorpay";
import { CashfreeAdapter } from "./cashfree";
import { StripeAdapter } from "./stripe";
import { ShopifyCreditAdapter } from "./shopify_credit";
import { PayUAdapter } from "./payu";
import { PaytmAdapter } from "./paytm";
import { EasebuzzAdapter } from "./easebuzz";

// Tier 2 — Stubs
import { RazorpayXAdapter } from "./razorpay_x";
import { AdyenAdapter } from "./adyen";
import { CashgramAdapter } from "./cashgram";
import { TransbnkAdapter } from "./transbnk";
import { ShopfloAdapter } from "./shopflo";
import { NectorAdapter } from "./nector";
import { EasyrewardzAdapter } from "./easyrewardz";
import { GyftrAdapter } from "./gyftr";
import { FlitsAdapter } from "./flits";
import { CredityardAdapter } from "./credityard";
import { TapAdapter } from "./tap";
import { PaypalAdapter } from "./paypal";
import { KlarnaAdapter } from "./klarna";

// Register all payment adapters
paymentRegistry.register(new RazorpayAdapter());
paymentRegistry.register(new CashfreeAdapter());
paymentRegistry.register(new StripeAdapter());
paymentRegistry.register(new ShopifyCreditAdapter());
paymentRegistry.register(new PayUAdapter());
paymentRegistry.register(new PaytmAdapter());
paymentRegistry.register(new RazorpayXAdapter());
paymentRegistry.register(new AdyenAdapter());
paymentRegistry.register(new CashgramAdapter());
paymentRegistry.register(new EasebuzzAdapter());
paymentRegistry.register(new TransbnkAdapter());
paymentRegistry.register(new ShopfloAdapter());
paymentRegistry.register(new NectorAdapter());
paymentRegistry.register(new EasyrewardzAdapter());
paymentRegistry.register(new GyftrAdapter());
paymentRegistry.register(new FlitsAdapter());
paymentRegistry.register(new CredityardAdapter());
paymentRegistry.register(new TapAdapter());
paymentRegistry.register(new PaypalAdapter());
paymentRegistry.register(new KlarnaAdapter());

// Re-export for convenience
export { paymentRegistry } from "./registry";
export { PaymentAdapter } from "./base";
export type {
  RefundParams,
  RefundResult,
  StoreCreditParams,
  StoreCreditResult,
  CredentialField,
} from "./base";
