// Centralized currency formatting utility
// Uses store's default currency from Shopify, NOT hardcoded ₹

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3",
  AUD: "A$", CAD: "C$", JPY: "\u00A5", SGD: "S$",
  AED: "AED\u00A0", SAR: "SAR\u00A0", QAR: "QAR\u00A0",
  BRL: "R$", MXN: "MX$", KRW: "\u20A9", CNY: "\u00A5",
  THB: "\u0E3F", MYR: "RM", IDR: "Rp", PHP: "\u20B1",
  VND: "\u20AB", TWD: "NT$", HKD: "HK$", NZD: "NZ$",
  SEK: "kr", NOK: "kr", DKK: "kr", CHF: "CHF\u00A0",
  PLN: "z\u0142", CZK: "K\u010D", TRY: "\u20BA", ZAR: "R",
  ILS: "\u20AA", RUB: "\u20BD", BGN: "\u043B\u0432",
};

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB",
  AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP", SGD: "en-SG",
  AED: "ar-AE", BRL: "pt-BR", MXN: "es-MX", KRW: "ko-KR",
  CNY: "zh-CN", THB: "th-TH", MYR: "ms-MY", IDR: "id-ID",
};

/** Get currency symbol for a currency code */
export function getCurrencySymbol(currencyCode: string): string {
  if (!currencyCode) return "$";
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode.toUpperCase() + "\u00A0";
}

/** Format a number as currency with locale-appropriate formatting */
export function formatCurrency(amount: number | string, currencyCode: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  const code = (currencyCode || "USD").toUpperCase();
  const locale = CURRENCY_LOCALES[code] || "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: code === "JPY" || code === "KRW" ? 0 : 2,
      maximumFractionDigits: code === "JPY" || code === "KRW" ? 0 : 2,
    }).format(num);
  } catch {
    // Fallback if Intl doesn't know the currency
    const symbol = getCurrencySymbol(code);
    return `${symbol}${num.toLocaleString()}`;
  }
}

/** Format a number with locale-appropriate grouping (no currency symbol) */
export function formatAmount(amount: number | string, currencyCode: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  const code = (currencyCode || "USD").toUpperCase();
  const locale = CURRENCY_LOCALES[code] || "en-US";
  const decimals = code === "JPY" || code === "KRW" ? 0 : 2;
  return num.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
