/*
  Warnings:

  - You are about to drop the column `apiKey` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `apiKeyHash` on the `clients` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[emailVerificationToken]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passwordResetToken]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "clients_apiKey_idx";

-- DropIndex
DROP INDEX "clients_apiKey_key";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "apiKey",
DROP COLUMN "apiKeyHash",
ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "maxApiKeys" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "triggerType" TEXT;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scopes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "qrCode" TEXT,
    "qrCodeExpiry" TIMESTAMP(3),
    "connectionStatus" TEXT NOT NULL DEFAULT 'disconnected',
    "lastConnectedAt" TIMESTAMP(3),
    "sessionData" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultWorkflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_clientId_idx" ON "api_keys"("clientId");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "api_keys_deletedAt_idx" ON "api_keys"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_clientId_idx" ON "refresh_tokens"("clientId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_phoneNumber_key" ON "whatsapp_configs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_configs_phoneNumber_idx" ON "whatsapp_configs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_configs_connectionStatus_idx" ON "whatsapp_configs"("connectionStatus");

-- CreateIndex
CREATE INDEX "whatsapp_configs_clientId_idx" ON "whatsapp_configs"("clientId");

-- CreateIndex
CREATE INDEX "whatsapp_configs_deletedAt_idx" ON "whatsapp_configs"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_emailVerificationToken_key" ON "clients"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "clients_passwordResetToken_key" ON "clients"("passwordResetToken");

-- CreateIndex
CREATE INDEX "clients_isActive_idx" ON "clients"("isActive");

-- CreateIndex
CREATE INDEX "workflows_triggerType_idx" ON "workflows"("triggerType");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_defaultWorkflowId_fkey" FOREIGN KEY ("defaultWorkflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
