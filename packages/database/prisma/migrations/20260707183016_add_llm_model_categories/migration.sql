-- CreateTable
CREATE TABLE "llm_model_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_model_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_model_categories_name_key" ON "llm_model_categories"("name");

-- CreateIndex
CREATE INDEX "llm_model_categories_isActive_idx" ON "llm_model_categories"("isActive");

-- AlterTable: agregar FK antes de eliminar la columna string para poder migrar los datos
ALTER TABLE "llm_models" ADD COLUMN "llmCategoryId" TEXT;

-- Backfill: crear una categoría por cada valor distinto no nulo de la columna vieja
INSERT INTO "llm_model_categories" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."category", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "llm_models" WHERE "category" IS NOT NULL) AS c;

-- Backfill: enlazar cada modelo con su categoría recién creada
UPDATE "llm_models" m
SET "llmCategoryId" = cat."id"
FROM "llm_model_categories" cat
WHERE m."category" = cat."name";

-- AlterTable: eliminar la columna string ya migrada
ALTER TABLE "llm_models" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "llm_models_llmCategoryId_idx" ON "llm_models"("llmCategoryId");

-- AddForeignKey
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_llmCategoryId_fkey" FOREIGN KEY ("llmCategoryId") REFERENCES "llm_model_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
