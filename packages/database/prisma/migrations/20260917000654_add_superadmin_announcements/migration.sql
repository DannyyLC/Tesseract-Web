-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('TEMPLATE', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "AnnouncementTemplate" AS ENUM ('NEWS', 'CELEBRATION');

-- Nota: prisma migrate dev proponía además `DROP INDEX "dataset_records_data_idx"`. Se quitó a
-- propósito: ese índice GIN se crea a mano en una migración anterior con SQL crudo (Prisma no
-- puede expresar `jsonb_path_ops` en el schema), así que el motor de diff lo ve como drift y lo
-- marca para borrar aunque sigue en uso. No tiene relación con este cambio.

-- AlterTable
-- Todas las columnas son nullable o traen default constante: ALTER ... ADD COLUMN es
-- catalog-only en PG 11+, no reescribe la tabla ni toma lock largo sobre las ~16 filas
-- sembradas de hoy.
ALTER TABLE "notifications" ADD COLUMN     "announcementTemplate" "AnnouncementTemplate",
ADD COLUMN     "createdByEmail" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "ctaLabel" TEXT,
ADD COLUMN     "ctaLabelEn" TEXT,
ADD COLUMN     "ctaUrl" TEXT,
ADD COLUMN     "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fannedOutAt" TIMESTAMP(3),
ADD COLUMN     "kind" "NotificationKind" NOT NULL DEFAULT 'TEMPLATE',
ADD COLUMN     "messageTemplateEn" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "targetOrganizationId" TEXT,
ADD COLUMN     "titleTemplateEn" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_notifications" ADD COLUMN     "ctaClickedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "messageSnapshotEn" TEXT,
ADD COLUMN     "titleSnapshotEn" TEXT;

-- IMPORTANTE — en producción NO ejecutar los CREATE INDEX de abajo tal cual, ni el
-- AddForeignKey en un solo paso.
-- Prisma envuelve cada migración en una transacción y CREATE INDEX CONCURRENTLY no
-- puede correr dentro de una. Según el checklist de CLAUDE.md, en producción hay que
-- ejecutar a mano, fuera de transacción:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_kind_createdAt_idx"
--     ON "notifications" ("kind", "createdAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_notifications_notificationId_idx"
--     ON "user_notifications" ("notificationId");
--
--   ALTER TABLE "notifications"
--     ADD CONSTRAINT "notifications_targetOrganizationId_fkey"
--     FOREIGN KEY ("targetOrganizationId") REFERENCES "organizations"("id")
--     ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
--   ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_targetOrganizationId_fkey";
--
-- ...verificar que los índices quedaron válidos:
--
--   SELECT indisvalid FROM pg_index
--   WHERE indexrelid = 'user_notifications_notificationId_idx'::regclass;
--
-- ...y registrar esta migración en "_prisma_migrations" con el sha256 de este archivo
-- para que un futuro migrate deploy no intente recrear lo mismo.

-- CreateIndex
CREATE INDEX "notifications_kind_createdAt_idx" ON "notifications"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "user_notifications_notificationId_idx" ON "user_notifications"("notificationId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
