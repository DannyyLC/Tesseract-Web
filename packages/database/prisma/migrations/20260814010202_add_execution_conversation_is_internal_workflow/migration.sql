-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "isInternalWorkflow" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "isInternalWorkflow" BOOLEAN NOT NULL DEFAULT false;
