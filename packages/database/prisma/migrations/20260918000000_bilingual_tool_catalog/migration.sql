-- Textos en inglés opcionales del catálogo de tools. Solo ADD COLUMN nullable, sin default ni
-- reescritura de filas: seguro sobre datos existentes. NULL = se usa displayName/description.
ALTER TABLE "tool_catalog" ADD COLUMN "displayNameEn" TEXT,
ADD COLUMN "descriptionEn" TEXT;

ALTER TABLE "tool_functions" ADD COLUMN "displayNameEn" TEXT,
ADD COLUMN "descriptionEn" TEXT;
