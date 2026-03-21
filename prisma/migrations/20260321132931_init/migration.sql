-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "delhiveryToken" TEXT,
    "delhiveryWarehouse" TEXT,
    "easebuzzKey" TEXT,
    "easebuzzSalt" TEXT,
    "easebuzzMid" TEXT,
    "easebuzzEnv" TEXT NOT NULL DEFAULT 'test',
    "warehouseName" TEXT,
    "warehouseAddress" TEXT,
    "warehouseCity" TEXT,
    "warehouseState" TEXT,
    "warehousePincode" TEXT,
    "warehousePhone" TEXT,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reqId" TEXT NOT NULL,
    "reqNum" INTEGER,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "refundMethod" TEXT,
    "shippingPreference" TEXT NOT NULL DEFAULT 'pickup',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestType" TEXT NOT NULL DEFAULT 'return',
    "totalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "address" JSONB,
    "isCod" BOOLEAN NOT NULL DEFAULT false,
    "daysSinceOrder" INTEGER NOT NULL DEFAULT 0,
    "awb" TEXT,
    "awbStatus" TEXT,
    "awbStatusCode" TEXT,
    "awbLastScan" JSONB,
    "awbLastChecked" TIMESTAMP(3),
    "awbFinal" BOOLEAN NOT NULL DEFAULT false,
    "exchangeOrderId" TEXT,
    "exchangeOrderName" TEXT,
    "exchangeOrderNumber" TEXT,
    "exchangeShopifyName" TEXT,
    "refundId" TEXT,
    "refundAmount" DECIMAL(10,2),
    "utrNumber" TEXT,
    "autoAction" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "pickupCreatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeCounter" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 9000,

    CONSTRAINT "ExchangeCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "reqId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "txnid" TEXT NOT NULL,
    "reqId" TEXT,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txnResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_reqId_key" ON "ReturnRequest"("reqId");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_orderId_idx" ON "ReturnRequest"("shop", "orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_status_idx" ON "ReturnRequest"("shop", "status");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_awb_idx" ON "ReturnRequest"("shop", "awb");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_approvedAt_idx" ON "ReturnRequest"("shop", "approvedAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_createdAt_idx" ON "ReturnRequest"("shop", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeCounter_shop_key" ON "ExchangeCounter"("shop");

-- CreateIndex
CREATE INDEX "AuditLog_shop_orderId_idx" ON "AuditLog"("shop", "orderId");

-- CreateIndex
CREATE INDEX "AuditLog_shop_createdAt_idx" ON "AuditLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Settings_shop_idx" ON "Settings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_shop_key_key" ON "Settings"("shop", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txnid_key" ON "Payment"("txnid");

-- CreateIndex
CREATE INDEX "Payment_shop_orderId_idx" ON "Payment"("shop", "orderId");

-- CreateIndex
CREATE INDEX "Payment_shop_reqId_idx" ON "Payment"("shop", "reqId");
