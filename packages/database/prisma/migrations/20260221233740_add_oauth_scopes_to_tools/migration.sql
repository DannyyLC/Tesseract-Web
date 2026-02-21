-- AlterTable
ALTER TABLE "tool_catalog" ADD COLUMN     "authConfig" JSONB;

-- AlterTable
ALTER TABLE "tool_functions" ADD COLUMN     "oauthScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
