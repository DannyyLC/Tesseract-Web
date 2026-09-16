-- AlterTable
-- Nullable, sin default: no reescribe la tabla ni toma lock largo.
ALTER TABLE "subscriptions" ADD COLUMN     "pastDueSince" TIMESTAMP(3);

-- Nota: prisma migrate dev proponía además `DROP INDEX "dataset_records_data_idx"`. Se quitó a
-- propósito: ese índice GIN se crea a mano en una migración anterior con SQL crudo (Prisma no
-- puede expresar `jsonb_path_ops` en el schema), así que el motor de diff lo ve como drift y lo
-- marca para borrar aunque sigue en uso. No tiene relación con este cambio.
