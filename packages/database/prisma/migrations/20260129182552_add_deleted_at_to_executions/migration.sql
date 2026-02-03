-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "executions_deletedAt_idx" ON "executions"("deletedAt");
