-- AlterEnum
ALTER TYPE "ConversationChannel" ADD VALUE 'MESSENGER';

-- CreateEnum
CREATE TYPE "MessengerConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "messenger_configs" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "pageAccessToken" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "connectionStatus" "MessengerConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastConnectedAt" TIMESTAMP(3),
    "connectionError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultWorkflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "messenger_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messenger_configs_pageId_key" ON "messenger_configs"("pageId");

-- CreateIndex
CREATE INDEX "messenger_configs_pageId_idx" ON "messenger_configs"("pageId");

-- CreateIndex
CREATE INDEX "messenger_configs_connectionStatus_idx" ON "messenger_configs"("connectionStatus");

-- CreateIndex
CREATE INDEX "messenger_configs_organizationId_idx" ON "messenger_configs"("organizationId");

-- CreateIndex
CREATE INDEX "messenger_configs_deletedAt_idx" ON "messenger_configs"("deletedAt");

-- AddForeignKey
ALTER TABLE "messenger_configs" ADD CONSTRAINT "messenger_configs_defaultWorkflowId_fkey" FOREIGN KEY ("defaultWorkflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messenger_configs" ADD CONSTRAINT "messenger_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "messengerConfigId" TEXT,
ADD COLUMN     "messengerSenderId" TEXT;

-- CreateIndex
CREATE INDEX "conversations_messengerConfigId_idx" ON "conversations"("messengerConfigId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_messengerConfigId_fkey" FOREIGN KEY ("messengerConfigId") REFERENCES "messenger_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
