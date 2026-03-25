-- AlterTable: add new columns to ReturnRequest
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "searchIndex" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "exportedAt" TIMESTAMP(3);

-- CreateTable: Location
CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "pincode" TEXT NOT NULL,
    "phone" TEXT,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "locationId" TEXT,
    "facilityCode" TEXT,
    "locationType" TEXT NOT NULL DEFAULT 'Warehouse',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Location_shop_idx" ON "Location"("shop");

-- CreateTable: Language
CREATE TABLE IF NOT EXISTS "Language" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Language_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Language_shop_locale_key" UNIQUE ("shop", "locale")
);

-- CreateTable: BillingUsage
CREATE TABLE IF NOT EXISTS "BillingUsage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,
    "requestsLimit" INTEGER NOT NULL DEFAULT 100,
    "logisticsUsed" INTEGER NOT NULL DEFAULT 0,
    "logisticsLimit" INTEGER NOT NULL DEFAULT 1,
    "usersUsed" INTEGER NOT NULL DEFAULT 1,
    "usersLimit" INTEGER NOT NULL DEFAULT 1,
    "billingCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingCycleEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "additionalCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingUsage_shop_key" UNIQUE ("shop")
);

-- CreateTable: AppUser
CREATE TABLE IF NOT EXISTS "AppUser" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB DEFAULT '{}',
    "locations" TEXT[] DEFAULT '{}',
    "inviteToken" TEXT,
    "inviteAccepted" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppUser_shop_email_key" UNIQUE ("shop", "email")
);

-- CreateTable: EmailNotification
CREATE TABLE IF NOT EXISTS "EmailNotification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailNotification_shop_eventKey_key" UNIQUE ("shop", "eventKey")
);

-- CreateTable: EmailLog
CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnId" TEXT,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);
