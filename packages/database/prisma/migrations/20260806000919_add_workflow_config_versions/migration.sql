-- CreateEnum
CREATE TYPE "WorkflowVersionSource" AS ENUM ('BASELINE', 'ADMIN_UI', 'RESTORE', 'CLONE');

-- CreateTable
CREATE TABLE "workflow_config_versions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "source" "WorkflowVersionSource" NOT NULL DEFAULT 'ADMIN_UI',
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_config_versions_workflowId_createdAt_idx" ON "workflow_config_versions"("workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_config_versions_workflowId_version_key" ON "workflow_config_versions"("workflowId", "version");

-- AddForeignKey
ALTER TABLE "workflow_config_versions" ADD CONSTRAINT "workflow_config_versions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
