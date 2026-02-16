/*
  Warnings:

  - The primary key for the `user_notifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `id` was added to the `user_notifications` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "user_notifications" DROP CONSTRAINT "user_notifications_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "user_notifications_userId_organizationId_idx" ON "user_notifications"("userId", "organizationId");
