import { z } from "zod";

export const ReturnRequestSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  items: z.array(z.object({
    lineItemId: z.string(),
    title: z.string(),
    variantTitle: z.string().optional(),
    sku: z.string().optional(),
    quantity: z.number().int().positive(),
    price: z.number(),
    reason: z.string().optional(),
    reasonNote: z.string().optional(),
    photoUrl: z.string().url().optional(),
    action: z.enum(["return", "exchange"]).default("return"),
    exchangeVariantId: z.string().optional(),
  })),
  refundMethod: z.enum(["original", "store_credit", "bank_transfer"]).optional(),
  requestType: z.enum(["return", "exchange", "mixed"]).default("return"),
  address: z.object({
    name: z.string(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default("India"),
    phone: z.string(),
  }).optional(),
});

export type ReturnRequestInput = z.infer<typeof ReturnRequestSchema>;

export const LogisticsCredentialsSchema = z.object({
  providerKey: z.string().min(1),
  credentials: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
});

export type LogisticsCredentialsInput = z.infer<typeof LogisticsCredentialsSchema>;

export const PaymentCredentialsSchema = z.object({
  providerKey: z.string().min(1),
  credentials: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
});

export type PaymentCredentialsInput = z.infer<typeof PaymentCredentialsSchema>;

export const WmsCredentialsSchema = z.object({
  providerKey: z.string().min(1),
  credentials: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
});

export type WmsCredentialsInput = z.infer<typeof WmsCredentialsSchema>;
