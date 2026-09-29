-- Intentos fallidos por código de verificación (reset de contraseña, invitación y alta).
--
-- Aditiva y con default: las filas existentes quedan en 0 y el código anterior la ignora, así
-- que se puede aplicar antes del deploy sin ventana de incompatibilidad.
--
-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar este
-- archivo: es el diff espurio del índice GIN de 20260810180135_add_datasets (ver la nota en
-- 20260818173500_add_fiscal_profile_and_cfdi).
ALTER TABLE "user_verifications" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
