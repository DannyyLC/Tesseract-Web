-- AlterEnum
ALTER TYPE "ConversationChannel" ADD VALUE 'CRON';

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es_MX',
    "variables" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whatsAppConfigId" TEXT NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_cron_triggers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "triggerMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "workflowId" TEXT NOT NULL,
    "whatsAppConfigId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_cron_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_templates_whatsAppConfigId_idx" ON "whatsapp_templates"("whatsAppConfigId");

-- CreateIndex
CREATE INDEX "workflow_cron_triggers_organizationId_idx" ON "workflow_cron_triggers"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_cron_triggers_workflowId_idx" ON "workflow_cron_triggers"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_cron_triggers_isActive_idx" ON "workflow_cron_triggers"("isActive");

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_whatsAppConfigId_fkey" FOREIGN KEY ("whatsAppConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_cron_triggers" ADD CONSTRAINT "workflow_cron_triggers_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_cron_triggers" ADD CONSTRAINT "workflow_cron_triggers_whatsAppConfigId_fkey" FOREIGN KEY ("whatsAppConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_cron_triggers" ADD CONSTRAINT "workflow_cron_triggers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
