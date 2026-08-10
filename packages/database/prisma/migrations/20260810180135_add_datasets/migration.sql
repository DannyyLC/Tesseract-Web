-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "customMaxDatasetRows" INTEGER,
ADD COLUMN     "customMaxDatasets" INTEGER;

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_records" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dataset_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkflowToDataset" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkflowToDataset_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "datasets_organizationId_deletedAt_idx" ON "datasets"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "dataset_records_datasetId_idx" ON "dataset_records"("datasetId");

-- CreateIndex
CREATE INDEX "_WorkflowToDataset_B_index" ON "_WorkflowToDataset"("B");

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_records" ADD CONSTRAINT "dataset_records_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkflowToDataset" ADD CONSTRAINT "_WorkflowToDataset_A_fkey" FOREIGN KEY ("A") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkflowToDataset" ADD CONSTRAINT "_WorkflowToDataset_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice GIN para los filtros de los campos `select`, que son los únicos que se consultan por
-- igualdad. `jsonb_path_ops` es más compacto y rápido que el default, pero solo soporta el
-- operador de contención `@>`: por eso el query builder emite `data @> '{"marca":"Toyota"}'`
-- para los select en vez de `data->>'marca' = ...`, que no usaría el índice.
--
-- Se crea sin CONCURRENTLY a propósito: la tabla nace vacía en esta misma migración, así que no
-- hay escrituras que bloquear. Un índice para acelerar ILIKE (pg_trgm) se deja fuera hasta que
-- se mida que hace falta; con el filtro por datasetId y los volúmenes de estos catálogos, el
-- scan secuencial sobre las columnas de texto es suficiente.
CREATE INDEX "dataset_records_data_idx" ON "dataset_records" USING GIN ("data" jsonb_path_ops);
