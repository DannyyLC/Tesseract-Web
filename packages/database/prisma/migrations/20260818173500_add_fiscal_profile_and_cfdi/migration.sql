-- Facturación automática CFDI 4.0 (México).
--
-- Añade el perfil fiscal de la organización (los datos que el SAT valida contra su padrón
-- al timbrar) y los campos del CFDI en las facturas.
--
-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar este
-- archivo: ese índice GIN se crea con SQL crudo en 20260810180135_add_datasets porque su
-- clase de operador (jsonb_path_ops) no se puede declarar en schema.prisma, así que Prisma
-- no lo reconoce como propio y lo marca para borrar cada vez que se regenera una migración.
-- Es un diff espurio, no un cambio real.
--
-- En producción los índices nuevos son sobre `invoices`, que hoy está vacía, así que el
-- CREATE INDEX normal no bloquea nada. Si algún día se aplica sobre una tabla con volumen,
-- usar CREATE INDEX CONCURRENTLY fuera de transacción (ver checklist en CLAUDE.md).

-- CreateEnum
CREATE TYPE "CfdiStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'STAMPING', 'STAMPED', 'FAILED');

-- CreateEnum
CREATE TYPE "CfdiErrorKind" AS ENUM ('CLIENT_DATA', 'INTERNAL');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cfdiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cfdiError" TEXT,
ADD COLUMN     "cfdiErrorKind" "CfdiErrorKind",
ADD COLUMN     "cfdiFolioNumber" INTEGER,
ADD COLUMN     "cfdiLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "cfdiPdfPath" TEXT,
ADD COLUMN     "cfdiStampedAt" TIMESTAMP(3),
ADD COLUMN     "cfdiStatus" "CfdiStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "cfdiUuid" TEXT,
ADD COLUMN     "cfdiXmlPath" TEXT,
ADD COLUMN     "facturapiId" TEXT;

-- CreateTable
CREATE TABLE "fiscal_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "taxRegime" TEXT NOT NULL,
    "cfdiUse" TEXT NOT NULL DEFAULT 'G03',
    "email" TEXT NOT NULL,
    "facturapiCustomerId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_profiles_organizationId_key" ON "fiscal_profiles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_profiles_facturapiCustomerId_key" ON "fiscal_profiles"("facturapiCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_cfdiUuid_key" ON "invoices"("cfdiUuid");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_facturapiId_key" ON "invoices"("facturapiId");

-- CreateIndex
CREATE INDEX "invoices_cfdiStatus_paidAt_idx" ON "invoices"("cfdiStatus", "paidAt");

-- AddForeignKey
ALTER TABLE "fiscal_profiles" ADD CONSTRAINT "fiscal_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
