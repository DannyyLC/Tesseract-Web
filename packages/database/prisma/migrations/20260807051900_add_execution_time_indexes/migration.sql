-- Índices compuestos para las consultas de series temporales (histograma horario y
-- dailyStats). Antes solo existían "workflowId" y "startedAt" por separado, así que
-- un filtro "este workflow, últimos 30 días" no quedaba cubierto por ninguno.

-- IMPORTANTE — en producción NO ejecutar este archivo tal cual.
-- Prisma envuelve cada migración en una transacción y CREATE INDEX CONCURRENTLY no
-- puede correr dentro de una. Según el checklist de CLAUDE.md, en producción hay que
-- ejecutar a mano, fuera de transacción:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "executions_workflowId_startedAt_idx"
--     ON "executions" ("workflowId", "startedAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "executions_organizationId_startedAt_idx"
--     ON "executions" ("organizationId", "startedAt");
--
-- ...verificar que quedaron válidos:
--
--   SELECT indisvalid FROM pg_index
--   WHERE indexrelid = 'executions_workflowId_startedAt_idx'::regclass;
--
-- ...y registrar esta migración en "_prisma_migrations" con el sha256 de este archivo
-- para que un futuro migrate deploy no intente recrear los índices.

CREATE INDEX IF NOT EXISTS "executions_workflowId_startedAt_idx"
  ON "executions" ("workflowId", "startedAt");

CREATE INDEX IF NOT EXISTS "executions_organizationId_startedAt_idx"
  ON "executions" ("organizationId", "startedAt");
