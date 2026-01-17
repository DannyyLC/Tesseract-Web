/*
  Warnings:

  - You are about to drop the column `keyPrefix` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `api_keys` table. All the data in the column will be lost.
  - Added the required column `workflowId` to the `api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "api_keys_keyPrefix_idx";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "keyPrefix",
DROP COLUMN "scopes",
ADD COLUMN     "workflowId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "user_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_email_key" ON "user_verifications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_verificationCode_key" ON "user_verifications"("verificationCode");

-- CreateIndex
CREATE INDEX "user_verifications_email_idx" ON "user_verifications"("email");

-- CreateIndex
CREATE INDEX "user_verifications_expiresAt_idx" ON "user_verifications"("expiresAt");

-- CreateIndex
CREATE INDEX "api_keys_workflowId_idx" ON "api_keys"("workflowId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
