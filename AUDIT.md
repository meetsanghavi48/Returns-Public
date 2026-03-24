# BLAKC Returns Manager — AUDIT

## Existing Files & Status

### Configuration (Phase 1 — DONE, DO NOT TOUCH)
| File | Status | Notes |
|------|--------|-------|
| package.json | Complete | Remix + Shopify App + Polaris |
| shopify.app.toml | Complete | App proxy at /apps/returns |
| render.yaml | Complete | Free tier, Node 18 |
| vite.config.ts | Complete | Remix + HMR |
| tsconfig.json | Complete | Strict, ~/\* alias |
| .env.example | Complete | Core env vars |

### Prisma Schema (Phase 1)
| Model | Exists | Notes |
|-------|--------|-------|
| Session | Yes | Shopify session storage |
| Shop | Yes | Per-shop config, Delhivery/Easebuzz creds |
| ReturnRequest | Yes | Core returns model |
| ExchangeCounter | Yes | Sequential EXC numbering |
| ReturnCounter | Yes | Sequential return numbering |
| AuditLog | Yes | Compliance trail |
| Settings | Yes | Key-value per shop |
| ReturnReason | Yes | Configurable reasons |
| Payment | Yes | Easebuzz payment records |

### Models from SPEC — MISSING (need to add)
| Model | Status | Notes |
|-------|--------|-------|
| ReturnSettings | MISSING | Use existing Settings model instead |
| Return | EXISTS as ReturnRequest | Equivalent, keep existing |
| ReturnEvent | MISSING | Need for timeline tracking |
| LogisticsConfig | MISSING | Multi-provider logistics credentials |
| PaymentConfig | MISSING | Multi-provider payment credentials |
| WmsConfig | MISSING | WMS provider credentials |

### Core Services
| File | Exists | Status |
|------|--------|--------|
| app/db.server.ts | Yes | Complete — singleton Prisma |
| app/shopify.server.ts | Yes | Complete — auth, webhooks |
| app/services/returns.server.ts | Yes | Complete — CRUD, auto-approve |
| app/services/delhivery.server.ts | Yes | Complete — single provider |
| app/services/payments.server.ts | Yes | Complete — Easebuzz only |
| app/services/refunds.server.ts | Yes | Complete — Shopify refunds + store credit |
| app/services/exchanges.server.ts | Yes | Complete — draft orders |
| app/services/policies.server.ts | Yes | Complete — eligibility checks |
| app/services/settings.server.ts | Yes | Complete — key-value CRUD |
| app/services/audit.server.ts | Yes | Complete |
| app/services/shopify.server.ts | Yes | Complete — REST/GraphQL helpers |
| app/services/admin-session.server.ts | Yes | Complete — cookie auth |
| app/utils/encryption.server.ts | MISSING | Need AES-256-GCM |
| app/utils/validators.ts | MISSING | Need Zod schemas |
| app/services/logistics.server.ts | MISSING | Need multi-provider orchestration |
| app/services/tracking.server.ts | MISSING | Need tracking service |
| app/services/notifications.server.ts | MISSING | Need email notifications |

### Adapters — ALL MISSING
| System | Status |
|--------|--------|
| app/adapters/logistics/base.ts | MISSING |
| app/adapters/logistics/registry.ts | MISSING |
| app/adapters/logistics/\*.ts (16+ Indian + 6 global + 11 stubs) | MISSING |
| app/adapters/payments/base.ts | MISSING |
| app/adapters/payments/registry.ts | MISSING |
| app/adapters/payments/\*.ts (6 Tier 1 + 14 stubs) | MISSING |
| app/adapters/wms/base.ts | MISSING |
| app/adapters/wms/registry.ts | MISSING |
| app/adapters/wms/\*.ts (2 Tier 1 + 12 stubs) | MISSING |

### Routes — Embedded Admin (app.\*)
| Route | Exists | Status |
|-------|--------|--------|
| app.tsx | Yes | Complete — layout + nav |
| app.\_index.tsx | Yes | Complete — redirects to admin |
| app.returns.tsx | Yes | Complete — list view |
| app.returns.$reqId.tsx | Yes | Complete — detail view |
| app.returns.new.tsx | Yes | Complete — manual creation |
| app.settings.tsx | Yes | Complete — settings form |
| app.audit.tsx | Yes | Complete — audit log |
| app.integrations.tsx | MISSING | Need integrations hub |
| app.integrations.logistics.tsx | MISSING | |
| app.integrations.payments.tsx | MISSING | |
| app.integrations.wms.tsx | MISSING | |
| app.analytics.tsx | MISSING | Need analytics dashboard |

### Routes — Standalone Admin (admin.\*)
| Route | Exists | Status |
|-------|--------|--------|
| admin.tsx | Yes | Complete — layout |
| admin.dashboard.tsx | Yes | Complete |
| admin.returns.tsx | Yes | BUG: accessToken undefined in loader |
| admin.return.$reqId.tsx | Yes | Complete |
| admin.settings.tsx | Yes | Complete — landing page |
| admin.settings\_.general.tsx | Yes | Complete |
| admin.settings\_.policies.tsx | Yes | Complete |
| admin.settings\_.reasons.tsx | Yes | Complete |
| admin.audit.tsx | Yes | Complete |

### Routes — Customer Portal (portal.\*)
| Route | Exists | Status |
|-------|--------|--------|
| portal.$shop.tsx | Yes | Complete — layout |
| portal.$shop.\_index.tsx | Yes | Complete — order lookup |
| portal.$shop.request.tsx | Yes | Complete — item selection |
| portal.$shop.exchange.tsx | Yes | Complete — exchange variants |
| portal.$shop.confirm.tsx | Yes | Complete — confirmation |
| portal.$shop.tracking.$reqId.tsx | Yes | Complete |
| portal.$shop.tracking.\_index.tsx | Yes | Complete |
| portal.$shop.variants.tsx | Yes | Complete — API endpoint |

### Routes — API & Webhooks
| Route | Exists | Status |
|-------|--------|--------|
| webhooks.tsx | Yes | Complete |
| api.health.tsx | Yes | Complete |
| api.gdpr.tsx | Yes | Complete |
| api.cron.pickups.ts | Yes | Complete — Delhivery only |
| api.cron.tracking.ts | Yes | Complete — Delhivery only |
| api.payments.callback.tsx | Yes | Complete — Easebuzz |
| api.portal-redirect.tsx | Yes | Complete |
| api.cron.tsx | MISSING | Need unified cron endpoint |

### Chat/WhatsApp Webhooks — ALL MISSING
### Mobile App Integrations — ALL MISSING
### Marketing/CRM Integrations — ALL MISSING
### Tests — ALL MISSING

## Known Bugs
1. `admin.returns.tsx` line 54: `accessToken` undefined in loader (destructures only `{ shop }`)

## What Needs To Be Built (by Phase)

### Phase 2 — Database & Core Services
- [ ] Add LogisticsConfig, PaymentConfig, WmsConfig, ReturnEvent models to schema
- [ ] Run migration
- [ ] Build encryption.server.ts
- [ ] Build validators.ts
- [ ] Update app.\_index.tsx dashboard with stats (currently just redirects)

### Phase 3 — Logistics Adapter System
- [ ] Base adapter class + registry
- [ ] 16 Indian logistics adapters (Delhivery real, others researched/stubbed)
- [ ] 6 global logistics adapters
- [ ] 11 Tier 2 stubs
- [ ] logistics.server.ts orchestration service

### Phase 4 — Customer Portal
- Already complete at portal.$shop.\* — may need minor updates

### Phase 5 — Integrations Hub
- [ ] app.integrations.tsx with tabs
- [ ] Logistics/Payments/WMS connect/disconnect routes

### Phase 6 — Payment Adapters
- [ ] Base adapter + registry
- [ ] 6 Tier 1 payment adapters
- [ ] 14 Tier 2 stubs
- [ ] payments.server.ts multi-provider service

### Phase 7 — Tracking Cron
- [ ] Unified api.cron.tsx endpoint
- [ ] tracking.server.ts service

### Phase 8 — WMS Adapters
- [ ] Base adapter + registry
- [ ] 2 Tier 1 WMS adapters
- [ ] 12 Tier 2 stubs

### Phase 9 — Chat + Mobile + Marketing
- [ ] All webhook receivers and stubs

### Phase 10 — Settings + Analytics + Polish
- [ ] Enhanced app.settings.tsx
- [ ] app.analytics.tsx
- [ ] notifications.server.ts
- [ ] Tests with 80% coverage
