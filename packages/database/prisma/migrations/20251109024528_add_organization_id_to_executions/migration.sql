/*
  Warnings:

  - Added the required column `organizationId` to the `executions` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add column as nullable first
ALTER TABLE "executions" ADD COLUMN "organizationId" TEXT;

-- Step 2: Populate organizationId from the workflow's organizationId
UPDATE "executions" e
SET "organizationId" = w."organizationId"
FROM "workflows" w
WHERE e."workflowId" = w.id;

-- Step 3: Make it NOT NULL now that it has data
ALTER TABLE "executions" ALTER COLUMN "organizationId" SET NOT NULL;

-- Step 4: Create index
CREATE INDEX "executions_organizationId_idx" ON "executions"("organizationId");

-- Step 5: Add foreign key constraint
ALTER TABLE "executions" ADD CONSTRAINT "executions_organizationId_fkey" 
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;
