-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processed_webhook_events_processedAt_idx" ON "processed_webhook_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_provider_eventId_key" ON "processed_webhook_events"("provider", "eventId");
