-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('ANY', 'SUMMER', 'EASTER', 'CHRISTMAS', 'OFFSEASON');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'PER_NIGHT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('NONE', 'DRAFT', 'SENT', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "season" "Season" NOT NULL DEFAULT 'ANY',
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'FIXED',
    "priceOre" INTEGER NOT NULL,
    "depositOre" INTEGER,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "startWeekday" INTEGER,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "checkIn" TIMESTAMPTZ(3) NOT NULL,
    "checkOut" TIMESTAMPTZ(3) NOT NULL,
    "guests" INTEGER,
    "status" "BookingStatus" NOT NULL DEFAULT 'TENTATIVE',
    "notes" TEXT,
    "presetId" TEXT,
    "presetName" TEXT,
    "presetLocked" BOOLEAN NOT NULL DEFAULT false,
    "priceOre" INTEGER NOT NULL,
    "suggestedPriceOre" INTEGER,
    "priceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "season" "Season" NOT NULL DEFAULT 'ANY',
    "depositOre" INTEGER NOT NULL DEFAULT 0,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositPaidAt" TIMESTAMP(3),
    "depositReturned" BOOLEAN NOT NULL DEFAULT false,
    "depositReturnedAt" TIMESTAMP(3),
    "depositWithheldOre" INTEGER NOT NULL DEFAULT 0,
    "depositNote" TEXT,
    "rentPaid" BOOLEAN NOT NULL DEFAULT false,
    "rentPaidAt" TIMESTAMP(3),
    "contractStatus" "ContractStatus" NOT NULL DEFAULT 'NONE',
    "contractHtml" TEXT,
    "contractRendered" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "contractSignedBy" TEXT,
    "esignProvider" TEXT,
    "esignReference" TEXT,
    "esignUrl" TEXT,
    "powerKwh" DECIMAL(12,3),
    "powerCostOre" INTEGER,
    "powerFetchedAt" TIMESTAMP(3),
    "powerRaw" JSONB,
    "powerChargedOre" INTEGER,
    "powerFromDeposit" BOOLEAN NOT NULL DEFAULT true,
    "calendarUid" TEXT NOT NULL,
    "calendarSyncedAt" TIMESTAMP(3),
    "calendarEtag" TEXT,
    "calendarHref" TEXT,
    "calendarDirty" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "bookingId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Preset_active_season_idx" ON "Preset"("active", "season");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_calendarUid_key" ON "Booking"("calendarUid");

-- CreateIndex
CREATE INDEX "Booking_checkIn_idx" ON "Booking"("checkIn");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_email_idx" ON "Booking"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "NotificationLog_event_bookingId_idx" ON "NotificationLog"("event", "bookingId");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Double-booking prevention, enforced by the database rather than app code.
-- btree_gist lets a GiST exclusion constraint index a timestamptz range.
-- Cancelled bookings are excluded so a freed period can be rebooked.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    tstzrange("checkIn", "checkOut", '[)') WITH &&
  )
  WHERE (status <> 'CANCELLED');

-- A stay must end after it starts.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_period_valid" CHECK ("checkOut" > "checkIn");

-- Money is stored in øre and can never be negative. Withheld amounts here are
-- the "other deductions" line only; the power bill is deducted separately.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_amounts_nonnegative" CHECK (
    "priceOre" >= 0 AND "depositOre" >= 0 AND "depositWithheldOre" >= 0
    AND "depositWithheldOre" <= "depositOre"
  );

ALTER TABLE "Preset"
  ADD CONSTRAINT "preset_price_nonnegative" CHECK (
    "priceOre" >= 0 AND ("depositOre" IS NULL OR "depositOre" >= 0)
  );

ALTER TABLE "Preset"
  ADD CONSTRAINT "preset_nights_valid" CHECK (
    ("minNights" IS NULL OR "minNights" >= 1)
    AND ("maxNights" IS NULL OR "maxNights" >= 1)
    AND ("minNights" IS NULL OR "maxNights" IS NULL OR "minNights" <= "maxNights")
  );
