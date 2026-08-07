-- Backfill: hasta ahora ninguna conversacion nacia con `lastMessageAt`, y en un
-- ORDER BY ... DESC los NULL de Postgres van primero. Eso mandaba al tope del
-- listado justo las conversaciones sin mensajes. Va antes del indice para que
-- este se construya sobre datos ya limpios.
UPDATE "conversations" SET "lastMessageAt" = "createdAt" WHERE "lastMessageAt" IS NULL;

-- CreateIndex
CREATE INDEX "conversations_organizationId_isHumanInTheLoop_needsFollowUp_idx" ON "conversations"("organizationId", "isHumanInTheLoop" DESC, "needsFollowUp" DESC, "status", "lastMessageAt" DESC);
