-- CreateIndex
CREATE INDEX "executions_organizationId_trigger_startedAt_idx" ON "executions"("organizationId", "trigger", "startedAt");

-- CreateIndex
CREATE INDEX "executions_organizationId_wasOverage_idx" ON "executions"("organizationId", "wasOverage");

-- CreateIndex
CREATE INDEX "executions_organizationId_userId_startedAt_idx" ON "executions"("organizationId", "userId", "startedAt");

-- CreateIndex
CREATE INDEX "executions_organizationId_apiKeyId_startedAt_idx" ON "executions"("organizationId", "apiKeyId", "startedAt");
