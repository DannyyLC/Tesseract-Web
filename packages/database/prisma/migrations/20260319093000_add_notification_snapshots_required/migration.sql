/*
  Warnings:

  - Added the required columns `titleSnapshot` and `messageSnapshot` to the `user_notifications` table.
    This will fail if the table is not empty.
*/
-- AlterTable
ALTER TABLE "user_notifications"
ADD COLUMN "titleSnapshot" TEXT NOT NULL,
ADD COLUMN "messageSnapshot" TEXT NOT NULL;
