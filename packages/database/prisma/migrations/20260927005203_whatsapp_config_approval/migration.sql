-- Aprobación de números de WhatsApp por un super admin.
--
-- `approvedAt` NULL = pendiente: el número no recibe ni envía nada hasta que un super admin
-- confirma que es de esa organización. Los números que ya existen están operando, así que se dan
-- por aprobados en su fecha de alta: el backfill evita que el deploy los apague.
--
-- Aplicar ANTES del deploy: el código nuevo filtra por esta columna. El código anterior la ignora.
--
-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar este
-- archivo: es el diff espurio del índice GIN de 20260810180135_add_datasets (ver la nota en
-- 20260818173500_add_fiscal_profile_and_cfdi).
ALTER TABLE "whatsapp_configs" ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "whatsapp_configs" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
