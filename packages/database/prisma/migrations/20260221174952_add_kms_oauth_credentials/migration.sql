/*
  Warnings:

  - You are about to drop the column `credentialPath` on the `tenant_tools` table. All the data in the column will be lost.
  - You are about to drop the column `oauthProvider` on the `tenant_tools` table. All the data in the column will be lost.
  - You are about to drop the column `tokenExpiresAt` on the `tenant_tools` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tenant_tools" DROP COLUMN "credentialPath",
DROP COLUMN "oauthProvider",
DROP COLUMN "tokenExpiresAt",
ADD COLUMN     "allowedFunctions" JSONB,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'connected';

-- CreateTable
CREATE TABLE "tenant_tool_credentials" (
    "id" TEXT NOT NULL,
    "tenantToolId" TEXT NOT NULL,
    "oauthProvider" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_tool_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_tool_credentials_tenantToolId_key" ON "tenant_tool_credentials"("tenantToolId");

-- CreateIndex
CREATE INDEX "tenant_tools_deletedAt_idx" ON "tenant_tools"("deletedAt");

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tool_credentials" ADD CONSTRAINT "tenant_tool_credentials_tenantToolId_fkey" FOREIGN KEY ("tenantToolId") REFERENCES "tenant_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
