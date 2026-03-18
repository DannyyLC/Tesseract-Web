-- Migration: Convert users.role from TEXT to UserRole enum
-- The column previously stored lowercase text values ('owner', 'admin', 'viewer')
-- Steps:
-- 1. Create the enum type with uppercase values
-- 2. Drop the text default
-- 3. Convert the column to enum, uppercasing existing values
-- 4. Restore the default using the enum type

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'ADMIN', 'OWNER');

-- Drop default before alter (required for type casting)
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- AlterTable: Convert TEXT column to UserRole enum, mapping lowercase to uppercase
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (UPPER("role")::"UserRole");

-- Restore default
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'VIEWER'::"UserRole";
