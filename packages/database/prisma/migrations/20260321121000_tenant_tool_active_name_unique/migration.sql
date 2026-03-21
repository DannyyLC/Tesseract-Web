-- Allow reusing displayName when previous tool instance is soft-deleted.
-- Enforce uniqueness only across ACTIVE tenant tools (deletedAt IS NULL).

ALTER TABLE "tenant_tools"
DROP CONSTRAINT IF EXISTS "tenant_tools_organizationId_displayName_key";

DROP INDEX IF EXISTS "tenant_tools_organizationId_displayName_key";

CREATE INDEX IF NOT EXISTS "tenant_tools_organizationId_displayName_idx"
ON "tenant_tools"("organizationId", "displayName");

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_tools_org_display_active_unique"
ON "tenant_tools"("organizationId", "displayName")
WHERE "deletedAt" IS NULL;
