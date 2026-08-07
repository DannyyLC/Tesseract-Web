-- AlterTable
ALTER TABLE "users" ADD COLUMN     "twoFactorLastUsedStep" INTEGER,
ADD COLUMN     "twoFactorPendingSecret" TEXT;

-- CreateTable
CREATE TABLE "user_backup_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_backup_codes_codeHash_key" ON "user_backup_codes"("codeHash");

-- CreateIndex
CREATE INDEX "user_backup_codes_userId_idx" ON "user_backup_codes"("userId");

-- AddForeignKey
ALTER TABLE "user_backup_codes" ADD CONSTRAINT "user_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
