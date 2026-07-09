-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "_TagToWorkflow" ADD CONSTRAINT "_TagToWorkflow_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_TagToWorkflow_AB_unique";

-- AlterTable
ALTER TABLE "_WorkflowToTenantTool" ADD CONSTRAINT "_WorkflowToTenantTool_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_WorkflowToTenantTool_AB_unique";
