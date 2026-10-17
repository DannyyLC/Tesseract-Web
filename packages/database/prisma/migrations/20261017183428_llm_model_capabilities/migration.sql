-- Capacidades por modelo en el catálogo: qué parámetros acepta cada uno.
--
-- El validador de workflows las usa para rechazar al guardar un agente con `temperature`
-- o `model_params` que el modelo no admite, y el motor manda tal cual lo validado. Antes
-- nadie lo comprobaba: LiteLLM lo deducía del nombre del modelo y, con uno que no conocía
-- (gpt-6-luna), bloqueaba `reasoning_effort` sin llegar al proveedor.
--
-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar este
-- archivo: es el índice GIN de 20260810180135_add_datasets (jsonb_path_ops no se puede
-- declarar en schema.prisma). Diff espurio, ver 20260818173500_add_fiscal_profile_and_cfdi.
--
-- Aditiva: columnas con default, el código anterior no las lee.
--
-- Solo schema. Las capacidades de cada modelo (qué acepta) son datos y se cargan aparte,
-- a mano o desde el panel de modelos, después de aplicar esta migración.

-- AlterTable
ALTER TABLE "llm_models" ADD COLUMN     "allowedParams" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "supportsTemperature" BOOLEAN NOT NULL DEFAULT true;
