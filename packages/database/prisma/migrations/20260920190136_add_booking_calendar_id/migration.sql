-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar
-- este archivo: ese índice GIN se crea con SQL crudo en la migración de datasets
-- (20260810180135_add_datasets) porque su tipo de operador (jsonb_path_ops) no se puede
-- declarar en schema.prisma, así que Prisma no lo ve como propio y lo marca para borrar
-- cada vez que se regenera una migración. Es un diff espurio, no un cambio real (mismo caso
-- ya documentado en 20260815020219_add_conversation_internal_index).

-- AlterTable
ALTER TABLE "booking_calendar_credentials" ADD COLUMN     "calendarId" TEXT NOT NULL DEFAULT 'primary';
