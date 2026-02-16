/*
  Warnings:

  - The primary key for the `user_notifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `organizationId` to the `user_notifications` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_notifications" DROP CONSTRAINT "user_notifications_pkey",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("userId", "organizationId", "notificationId");

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
