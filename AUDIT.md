# BLAKC Returns Manager — AUDIT

> Last updated: 2026-03-24

## Phase Completion Status

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1 — Auth/Setup** | ✅ DONE | Pre-existing. Not touched per rules. |
| **Phase 2 — Database** | 🔨 PARTIAL | Models added to schema + Prisma generated. **Migration NOT run** (needs DB connection). encryption.server.ts + validators.ts done. |
| **Phase 3 — Logistics Adapters** | ✅ DONE | Base class, registry, 37 adapters (10 real, 27 stubs), logistics.server.ts orchestration |
| **Phase 4 — Customer Portal** | ✅ DONE | Pre-existing and complete. No changes needed. |
| **Phase 5 — Integrations Hub** | ✅ DONE | Polaris page with 6 tabs, connect/disconnect/test modals, 3 sub-routes |
| **Phase 6 — Payment Adapters** | ✅ DONE | Base class, registry, 20 adapters (8 real, 12 stubs) |
| **Phase 7 — Tracking Cron** | ✅ DONE | Unified api.cron.tsx + tracking.server.ts with bulk refresh |
| **Phase 8 — WMS Adapters** | ✅ DONE | Base class, registry, 14 adapters (2 real, 12 stubs) |
| **Phase 9 — Chat/Mobile/Marketing** | ✅ DONE | Webhook receivers for 11 chat, 11 mobile, 7 marketing providers |
| **Phase 10 — Settings/Analytics** | 🔨 PARTIAL | Analytics dashboard done. Notifications done. **Tests NOT written.** |

## Prisma Schema — All 13 Models

| Model | Origin | Status |
|-------|--------|--------|
| Session | Phase 1 | ✅ Exists |
| Shop | Phase 1 | ✅ Exists |
| ReturnRequest | Phase 1 | ✅ Exists |
| ExchangeCounter | Phase 1 | ✅ Exists |
| ReturnCounter | Phase 1 | ✅ Exists |
| AuditLog | Phase 1 | ✅ Exists |
| Settings | Phase 1 | ✅ Exists |
| ReturnReason | Phase 1 | ✅ Exists |
| Payment | Phase 1 | ✅ Exists |
| ReturnEvent | This session | ✅ Added |
| LogisticsConfig | This session | ✅ Added |
| PaymentConfig | This session | ✅ Added |
| WmsConfig | This session | ✅ Added |

## Configuration (Phase 1 — DO NOT TOUCH)

| File | Status |
|------|--------|
| package.json | Complete — Remix + Shopify App + Polaris + Zod |
| shopify.app.toml | Complete — App proxy at /apps/returns |
| render.yaml | Complete — Free tier, Node 18 |
| vite.config.ts | Complete — Remix + HMR |
| tsconfig.json | Complete — Strict, ~/\* alias |
| .env.example | Needs update — missing ENCRYPTION_KEY, SENDGRID_API_KEY |

## Core Services

| File | Status |
|------|--------|
| app/db.server.ts | ✅ Complete — singleton Prisma |
| app/shopify.server.ts | ✅ Complete — auth, webhooks |
| app/services/returns.server.ts | ✅ Complete — CRUD, auto-approve |
| app/services/delhivery.server.ts | ✅ Complete — single provider (legacy) |
| app/services/payments.server.ts | ✅ Complete — Easebuzz (legacy) |
| app/services/refunds.server.ts | ✅ Complete — Shopify refunds + store credit |
| app/services/exchanges.server.ts | ✅ Complete — draft orders |
| app/services/policies.server.ts | ✅ Complete — eligibility checks |
| app/services/settings.server.ts | ✅ Complete — key-value CRUD |
| app/services/audit.server.ts | ✅ Complete |
| app/services/shopify.server.ts | ✅ Complete — REST/GraphQL helpers |
| app/services/admin-session.server.ts | ✅ Complete — cookie auth |
| app/utils/encryption.server.ts | ✅ Created — AES-256-GCM |
| app/utils/validators.ts | ✅ Created — Zod schemas |
| app/services/logistics.server.ts | ✅ Created — multi-provider orchestration |
| app/services/tracking.server.ts | ✅ Created — bulk tracking refresh |
| app/services/notifications.server.ts | ✅ Created — SendGrid email |

## Adapter System

### Logistics Adapters (37 total: 10 real, 27 stubs)

| Adapter | Type | Region | Fetch Calls |
|---------|------|--------|-------------|
| delhivery | **REAL** | IN | 2 |
| shiprocket | **REAL** | IN | 6 |
| nimbuspost | **REAL** | IN | 6 |
| ithink | **REAL** | IN | 2 |
| ecom_express | **REAL** | IN | 3 |
| shipway | **REAL** | IN | 4 |
| shyplite | **REAL** | IN | 2 |
| shippo | **REAL** | global | 4 |
| easypost | **REAL** | global | 4 |
| shipstation | **REAL** | global | 5 |
| xpressbees | STUB | IN | — |
| shadowfax | STUB | IN | — |
| dtdc | STUB | IN | — |
| bluedart | STUB | IN | — |
| ekart | STUB | IN | — |
| pickrr | STUB | IN | — |
| eshipz | STUB | IN | — |
| borzo | STUB | IN | — |
| porter | STUB | IN | — |
| dunzo | STUB | IN | — |
| lalamove | STUB | global | — |
| amazon_shipping | STUB | IN | — |
| fedex | STUB | global | — |
| ups | STUB | global | — |
| dhl | STUB | global | — |
| australia_post | STUB | AU | — |
| royal_mail | STUB | GB | — |
| canada_post | STUB | CA | — |
| postnl | STUB | NL | — |
| correos | STUB | ES | — |
| aramex | STUB | GCC | — |
| dhl_gcc | STUB | GCC | — |
| quiqup | STUB | GCC | — |
| oto | STUB | GCC | — |
| easy_parcel | STUB | SEA | — |
| starlinks | STUB | global | — |

### Payment Adapters (20 total: 8 real, 12 stubs)

| Adapter | Type | Fetch Calls |
|---------|------|-------------|
| razorpay | **REAL** | 5 |
| razorpay_x | **REAL** | 9 |
| cashfree | **REAL** | 5 |
| stripe | **REAL** | 5 |
| shopify_credit | **REAL** | 3 |
| payu | **REAL** | 4 |
| paytm | **REAL** | 4 |
| easebuzz | **REAL** | 6 |
| adyen | STUB | — |
| cashgram | STUB | — |
| transbnk | STUB | — |
| shopflo | STUB | — |
| nector | STUB | — |
| easyrewardz | STUB | — |
| gyftr | STUB | — |
| flits | STUB | — |
| credityard | STUB | — |
| tap | STUB | — |
| paypal | STUB | — |
| klarna | STUB | — |

### WMS Adapters (14 total: 2 real, 12 stubs)

| Adapter | Type | Fetch Calls |
|---------|------|-------------|
| unicommerce | **REAL** | 6 |
| zoho_inventory | **REAL** | 8 |
| fynd | STUB | — |
| omuni | STUB | — |
| vinculum | STUB | — |
| vinculum_marmeto | STUB | — |
| easyecom | STUB | — |
| easyecom_v3 | STUB | — |
| browntape | STUB | — |
| increff | STUB | — |
| bluecherry | STUB | — |
| idf | STUB | — |
| automyze | STUB | — |
| eshopbox | STUB | — |

## Routes — Embedded Admin (app.\*)

| Route | Status |
|-------|--------|
| app.tsx | ✅ Complete — layout + nav (Integrations + Analytics added) |
| app.\_index.tsx | ✅ Complete — redirects to admin |
| app.returns.tsx | ✅ Complete — list view |
| app.returns.$reqId.tsx | ✅ Complete — detail view |
| app.returns.new.tsx | ✅ Complete — manual creation |
| app.settings.tsx | ✅ Complete — settings form |
| app.audit.tsx | ✅ Complete — audit log |
| app.integrations.tsx | ✅ Created — integrations hub with 6 tabs |
| app.integrations.logistics.tsx | ✅ Created — connect/disconnect/test |
| app.integrations.payments.tsx | ✅ Created — connect/disconnect/test |
| app.integrations.wms.tsx | ✅ Created — connect/disconnect/test |
| app.analytics.tsx | ✅ Created — stats, reasons, top products, trends |

## Routes — Standalone Admin (admin.\*)

| Route | Status |
|-------|--------|
| admin.tsx | ✅ Complete — layout |
| admin.dashboard.tsx | ✅ Complete |
| admin.returns.tsx | ✅ Fixed — accessToken bug resolved |
| admin.return.$reqId.tsx | ✅ Complete |
| admin.settings.tsx | ✅ Complete — landing page |
| admin.settings\_.general.tsx | ✅ Complete |
| admin.settings\_.policies.tsx | ✅ Complete |
| admin.settings\_.reasons.tsx | ✅ Complete |
| admin.audit.tsx | ✅ Complete |

## Routes — Customer Portal (portal.\*)

| Route | Status |
|-------|--------|
| portal.$shop.tsx | ✅ Complete — layout |
| portal.$shop.\_index.tsx | ✅ Complete — order lookup |
| portal.$shop.request.tsx | ✅ Complete — item selection |
| portal.$shop.exchange.tsx | ✅ Complete — exchange variants |
| portal.$shop.confirm.tsx | ✅ Complete — confirmation |
| portal.$shop.tracking.$reqId.tsx | ✅ Complete |
| portal.$shop.tracking.\_index.tsx | ✅ Complete |
| portal.$shop.variants.tsx | ✅ Complete — API endpoint |

## Routes — API & Webhooks

| Route | Status |
|-------|--------|
| webhooks.tsx | ✅ Complete |
| api.health.tsx | ✅ Complete |
| api.gdpr.tsx | ✅ Complete |
| api.cron.pickups.ts | ✅ Complete — Delhivery |
| api.cron.tracking.ts | ✅ Complete — Delhivery |
| api.cron.tsx | ✅ Created — unified multi-provider cron |
| api.payments.callback.tsx | ✅ Complete — Easebuzz |
| api.portal-redirect.tsx | ✅ Complete |
| api.webhooks.chat.$provider.tsx | ✅ Created — 11 chat providers |
| api.mobile.$provider.tsx | ✅ Created — 11 mobile providers |
| api.events.$provider.tsx | ✅ Created — 7 marketing providers |

## API Research Docs (docs/apis/)

18 files: delhivery, shiprocket, nimbuspost, razorpay, razorpay_x, cashfree, stripe, shippo, easypost, shipstation, payu, paytm, easebuzz, unicommerce, zoho_inventory, xpressbees, ithink, ecom_express, shipway

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| admin.returns.tsx accessToken bug | Fixed | ✅ Resolved |
| Prisma migration not run | Medium | Schema updated, `migrate dev` needs DB connection |
| No tests exist | Medium | Tests folder empty, 0% coverage |
| .env.example missing new vars | Low | ENCRYPTION_KEY, SENDGRID_API_KEY not documented |
| Some Phase 1 files have uncommitted changes | Low | portal.\*, admin.\*, returns.server.ts, portal.css |

## What Needs To Be Built Next

1. Run `npx prisma migrate dev --name add_returns_v2_models`
2. Update `.env.example` with ENCRYPTION_KEY, SENDGRID_API_KEY
3. Write tests — encryption, validators, adapters, services (target 80% coverage)
4. Upgrade stubs to real implementations as API docs are provided
5. Push to remote → verify Render deployment
6. Test live at https://returns-public.onrender.com
