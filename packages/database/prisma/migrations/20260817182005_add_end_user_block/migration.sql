-- AlterTable
ALTER TABLE "end_users" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedByUserId" TEXT,
ADD COLUMN     "blockedReason" TEXT;

-- CreateIndex
CREATE INDEX "end_users_organizationId_blockedAt_idx" ON "end_users"("organizationId", "blockedAt");

-- AddForeignKey
ALTER TABLE "end_users" ADD CONSTRAINT "end_users_blockedByUserId_fkey" FOREIGN KEY ("blockedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
