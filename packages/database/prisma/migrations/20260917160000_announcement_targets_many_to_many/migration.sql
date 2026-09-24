-- Cambia el targeting de anuncios de "una organización o todas" (columna escalar
-- `targetOrganizationId`) a "cero, una o varias organizaciones específicas" (tabla
-- puente). Sin filas relacionadas = todas las organizaciones; esa convención vive en
-- el servicio, no en el schema.

-- Nota: prisma migrate diff proponía además `DROP INDEX "dataset_records_data_idx"`. Se
-- quitó a propósito: ese índice GIN se crea a mano en una migración anterior con SQL
-- crudo (Prisma no puede expresar `jsonb_path_ops` en el schema), así que el motor de
-- diff lo ve como drift y lo marca para borrar aunque sigue en uso. No tiene relación
-- con este cambio.

-- CreateTable
CREATE TABLE "announcement_target_organizations" (
    "notificationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "announcement_target_organizations_pkey" PRIMARY KEY ("notificationId","organizationId")
);

-- CreateIndex
CREATE INDEX "announcement_target_organizations_organizationId_idx" ON "announcement_target_organizations"("organizationId");

-- AddForeignKey
ALTER TABLE "announcement_target_organizations" ADD CONSTRAINT "announcement_target_organizations_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_target_organizations" ADD CONSTRAINT "announcement_target_organizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar los datos existentes: cada anuncio que ya apuntaba a una sola organización
-- pasa a tener una fila en la tabla puente con esa misma organización, antes de que
-- la columna vieja desaparezca.
INSERT INTO "announcement_target_organizations" ("notificationId", "organizationId")
SELECT "id", "targetOrganizationId" FROM "notifications" WHERE "targetOrganizationId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_targetOrganizationId_fkey";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "targetOrganizationId";
