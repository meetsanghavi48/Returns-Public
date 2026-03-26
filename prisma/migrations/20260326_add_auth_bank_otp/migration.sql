-- Add self-ship tracking fields to ReturnRequest
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "carrierName" TEXT;

-- Add bank details (encrypted) to ReturnRequest
ALTER TABLE "ReturnRequest" ADD COLUMN IF NOT EXISTS "bankDetails" TEXT;

-- Add auth fields to AppUser
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Create OtpSession table
CREATE TABLE IF NOT EXISTS "OtpSession" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OtpSession_shop_email_idx" ON "OtpSession"("shop", "email");
