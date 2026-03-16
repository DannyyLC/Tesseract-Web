-- CreateEnum
CREATE TYPE "MessageAttachmentType" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "MessageAttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'UNSUPPORTED');

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "attachments";

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "MessageAttachmentType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "contentHash" TEXT,
    "processingStatus" "MessageAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "processedText" TEXT,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "processor" TEXT,
    "processorVersion" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_attachments_messageId_createdAt_idx" ON "message_attachments"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "message_attachments_organizationId_contentHash_idx" ON "message_attachments"("organizationId", "contentHash");

-- CreateIndex
CREATE INDEX "message_attachments_processingStatus_idx" ON "message_attachments"("processingStatus");

-- CreateIndex
CREATE INDEX "message_attachments_createdAt_idx" ON "message_attachments"("createdAt");

-- CreateIndex
CREATE INDEX "conversations_channel_whatsappConfigId_phoneNumberSender_status_createdAt_idx" ON "conversations"("channel", "whatsappConfigId", "phoneNumberSender", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data quality checks
ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_processed_requires_text"
  CHECK (
    "processingStatus" <> 'PROCESSED'
    OR ("processedText" IS NOT NULL AND length(trim("processedText")) > 0)
  );

ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_failed_requires_error"
  CHECK (
    "processingStatus" <> 'FAILED'
    OR ("processingError" IS NOT NULL AND length(trim("processingError")) > 0)
  );

ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_hash_not_empty"
  CHECK (
    "contentHash" IS NULL
    OR length(trim("contentHash")) > 0
  );
