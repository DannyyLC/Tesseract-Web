-- NO incluye el "DropIndex ... dataset_records_data_idx" que Prisma propuso al generar
-- este archivo: ese índice GIN se crea con SQL crudo en la migración de datasets
-- (20260810180135_add_datasets) porque su tipo de operador (jsonb_path_ops) no se puede
-- declarar en schema.prisma, así que Prisma no lo ve como propio y lo marca para borrar
-- cada vez que se regenera una migración. Es un diff espurio, no un cambio real (mismo caso
-- ya documentado en 20260815020219_add_conversation_internal_index).

-- CreateTable
CREATE TABLE "booking_calendar_credentials" (
    "id" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scopes" JSONB,
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_calendar_credentials_pkey" PRIMARY KEY ("id")
);
