-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "followUpReason" TEXT,
ADD COLUMN     "needsFollowUp" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "conversations_needsFollowUp_idx" ON "conversations"("needsFollowUp");
