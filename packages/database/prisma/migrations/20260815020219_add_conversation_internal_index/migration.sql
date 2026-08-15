-- Extiende el índice del listado de conversaciones (ver comentario en schema.prisma)
-- para que también cubra el filtro `isInternalWorkflow: false` que findAll() agregó:
-- sin esto, esa condición se evalúa como Filter post-scan en vez de Index Cond en un
-- endpoint paginado y de alto tráfico.
--
-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar
-- este archivo: ese índice GIN se crea con SQL crudo en la migración de datasets
-- (20260810180135_add_datasets) porque su tipo de operador (jsonb_path_ops) no se
-- puede declarar en schema.prisma, así que Prisma no lo ve como propio y lo marca para
-- borrar cada vez que se regenera una migración. Es un diff espurio, no un cambio real.
--
-- IMPORTANTE — en producción NO ejecutar el CREATE INDEX tal cual.
-- Prisma envuelve cada migración en una transacción y CREATE INDEX CONCURRENTLY no
-- puede correr dentro de una. Según el checklist de CLAUDE.md, en producción hay que
-- ejecutar a mano, fuera de transacción:
--
--   DROP INDEX IF EXISTS "conversations_organizationId_isHumanInTheLoop_needsFollowUp_idx";
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS
--     "conversations_organizationId_isInternalWorkflow_isHumanInTh_idx"
--     ON "conversations"
--     ("organizationId", "isInternalWorkflow", "isHumanInTheLoop" DESC, "needsFollowUp" DESC, "status", "lastMessageAt" DESC);
--
-- ...verificar que quedó válido:
--
--   SELECT indisvalid FROM pg_index
--   WHERE indexrelid = 'conversations_organizationId_isInternalWorkflow_isHumanInTh_idx'::regclass;
--
-- ...y registrar esta migración en "_prisma_migrations" con el sha256 de este archivo
-- para que un futuro migrate deploy no intente recrearla.

-- DropIndex
DROP INDEX IF EXISTS "conversations_organizationId_isHumanInTheLoop_needsFollowUp_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_organizationId_isInternalWorkflow_isHumanInTh_idx" ON "conversations"("organizationId", "isInternalWorkflow", "isHumanInTheLoop" DESC, "needsFollowUp" DESC, "status", "lastMessageAt" DESC);
