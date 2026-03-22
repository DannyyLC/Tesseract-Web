-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "autoCloseAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversations_autoCloseAt_idx" ON "conversations"("autoCloseAt");
