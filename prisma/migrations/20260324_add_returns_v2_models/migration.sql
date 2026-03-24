-- CreateTable
CREATE TABLE "ReturnEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "region" TEXT NOT NULL DEFAULT 'IN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WmsConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WmsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnEvent_shop_returnId_idx" ON "ReturnEvent"("shop", "returnId");

-- CreateIndex
CREATE INDEX "ReturnEvent_returnId_createdAt_idx" ON "ReturnEvent"("returnId", "createdAt");

-- CreateIndex
CREATE INDEX "LogisticsConfig_shop_idx" ON "LogisticsConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsConfig_shop_providerKey_key" ON "LogisticsConfig"("shop", "providerKey");

-- CreateIndex
CREATE INDEX "PaymentConfig_shop_idx" ON "PaymentConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentConfig_shop_providerKey_key" ON "PaymentConfig"("shop", "providerKey");

-- CreateIndex
CREATE INDEX "WmsConfig_shop_idx" ON "WmsConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "WmsConfig_shop_providerKey_key" ON "WmsConfig"("shop", "providerKey");

