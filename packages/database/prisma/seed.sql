-- Generado por packages/database/prisma/generate-seed-sql.ts a partir de seed-data.ts.
-- NO EDITAR A MANO: los cambios se pierden en la siguiente generación. Para actualizar el
-- seed, edita seed-data.ts y corre `pnpm run seed:generate` desde packages/database.
--
-- Uso en prod: Cloud SQL Studio (misma mecánica que las migraciones manuales, ver
-- docs/manuals/migraciones-gcp.md) — pegar y ejecutar. Es idempotente: correrlo de nuevo
-- sobre datos ya sembrados no duplica nada ni los reordena.

BEGIN;


-- Categorías de modelos LLM

INSERT INTO "llm_model_categories" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'chat', true, now(), now())
ON CONFLICT ("name") DO UPDATE SET "isActive" = true, "updatedAt" = now();

INSERT INTO "llm_model_categories" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'reasoning', true, now(), now())
ON CONFLICT ("name") DO UPDATE SET "isActive" = true, "updatedAt" = now();

-- Modelos LLM

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-5.4-mini', 'BASIC', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 0.75, 4.5, 400000, 128000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-5.6-luna', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 1, 6, 1050000, 128000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-4o-mini', 'BASIC', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 0.15, 0.6, 128000, 100000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-4o', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 2.5, 10, 128000, 100000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-4o-2024-11-20', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 2.5, 10, 128000, 100000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'gpt-4-turbo', 'PREMIUM', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 10, 30, 128000, 100000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'o1', 'PREMIUM', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'reasoning'), 15, 60, 200000, 150000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'openai', 'o1-mini', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'reasoning'), 3, 12, 128000, 100000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'anthropic', 'claude-3-haiku-20240307', 'BASIC', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 0.25, 1.25, 200000, 150000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'anthropic', 'claude-3-5-sonnet-20241022', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 3, 15, 200000, 150000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'anthropic', 'claude-3-opus-20240229', 'PREMIUM', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 15, 75, 200000, 150000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'google', 'gemini-1.5-flash', 'BASIC', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 0.075, 0.3, 1000000, 800000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

INSERT INTO "llm_models" ("id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", "outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", "effectiveTo", "isActive", "currency", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'google', 'gemini-1.5-pro', 'STANDARD', (SELECT "id" FROM "llm_model_categories" WHERE "name" = 'chat'), 1.25, 5, 2000000, 1500000, TIMESTAMP '2026-01-01 00:00:00.000', NULL, true, 'USD', now(), now())
ON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "llmCategoryId" = EXCLUDED."llmCategoryId",
  "inputPricePer1m" = EXCLUDED."inputPricePer1m",
  "outputPricePer1m" = EXCLUDED."outputPricePer1m",
  "contextWindow" = EXCLUDED."contextWindow",
  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",
  "isActive" = true,
  "currency" = 'USD',
  "effectiveTo" = NULL,
  "updatedAt" = now();

-- Catálogo de tools y funciones

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'calculator', 'Calculator', 'Herramienta de calculo matematico. Soporta operaciones basicas, porcentajes y conversiones de moneda.', 'none', 'utility', 'mdi:calculator', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'calculator')
  AND "functionName" NOT IN ('calculator', 'percentage', 'currency_convert');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'calculator'), 'calculator', 'Calcular expresion', 'Evalua expresiones matematicas de forma segura. Soporta +, -, *, /, parentesis, decimales, modulo y potencias.', 'mdi:calculator-variant-outline', 'calculation', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'calculator'), 'percentage', 'Calcular porcentaje', 'Calcula el porcentaje de un valor.', 'mdi:percent-outline', 'calculation', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'calculator'), 'currency_convert', 'Convertir moneda', 'Convierte entre monedas (version mock para testing).', 'mdi:cash-multiple', 'conversion', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'human_handoff', 'Human Handoff', 'Escala la conversacion para atencion humana cuando el agente detecta que se requiere un miembro de la organizacion.', 'none', 'escalation', 'mdi:account-arrow-up', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'human_handoff')
  AND "functionName" NOT IN ('request_human_handoff');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'human_handoff'), 'request_human_handoff', 'Solicitar intervencion humana', 'Marca la conversacion para Human in the Loop y notifica a miembros de la organizacion.', 'mdi:account-arrow-up-outline', 'escalation', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'send_bulk_whatsapp', 'WhatsApp Outbound', 'Envia mensajes de plantilla de WhatsApp a multiples destinatarios usando templates pre-aprobados por Meta.', 'platform', 'messaging', 'logos:whatsapp-icon', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'send_bulk_whatsapp')
  AND "functionName" NOT IN ('send_bulk_whatsapp');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'send_bulk_whatsapp'), 'send_bulk_whatsapp', 'Enviar mensajes masivos', 'Envia mensajes de plantilla de WhatsApp a una lista de destinatarios. El numero remitente siempre es determinado por el sistema.', 'mdi:whatsapp', 'write', 'WARNING', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'dataset', 'Datos propios', 'Consulta los catalogos que la organizacion captura en Tesseract: productos, vehiculos, servicios o cualquier tabla propia.', 'platform', 'data', 'mdi:database-search', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'dataset')
  AND "functionName" NOT IN ('search_dataset', 'get_dataset_item', 'list_dataset_values');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'dataset'), 'search_dataset', 'Buscar en el catalogo', 'Busca filas del catalogo combinando filtros por columna y texto libre. Devuelve el total de coincidencias y las primeras filas.', 'mdi:table-search', 'read', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'dataset'), 'get_dataset_item', 'Ver una ficha completa', 'Devuelve todos los datos de una fila del catalogo a partir de su id.', 'mdi:card-account-details-outline', 'read', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'dataset'), 'list_dataset_values', 'Listar valores de una columna', 'Devuelve los valores distintos de una columna con su conteo. Sirve para responder que opciones existen cuando son demasiadas para caber en la firma de la busqueda.', 'mdi:format-list-bulleted', 'read', 'SAFE', ARRAY[]::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'google_calendar', 'Google Calendar', 'Gestion de agenda y eventos en Google Calendar.', 'google', 'productivity', 'logos:google-calendar', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar')
  AND "functionName" NOT IN ('check_calendar_availability', 'create_calendar_event', 'list_calendar_events', 'update_calendar_event', 'delete_calendar_event', 'get_calendar_event_details');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'check_calendar_availability', 'Verificar disponibilidad', 'Verifica si un horario esta disponible en el calendario.', 'mdi:calendar-check-outline', 'read', 'SAFE', ARRAY['https://www.googleapis.com/auth/calendar.events.readonly']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'create_calendar_event', 'Crear evento', 'Crea un nuevo evento en Google Calendar.', 'mdi:calendar-plus', 'write', 'SAFE', ARRAY['https://www.googleapis.com/auth/calendar.events']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'list_calendar_events', 'Listar eventos', 'Lista eventos en un rango de fechas.', 'mdi:calendar-month-outline', 'read', 'SAFE', ARRAY['https://www.googleapis.com/auth/calendar.events.readonly']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'update_calendar_event', 'Actualizar evento', 'Actualiza un evento existente en Google Calendar.', 'mdi:calendar-edit', 'write', 'WARNING', ARRAY['https://www.googleapis.com/auth/calendar.events']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'delete_calendar_event', 'Eliminar evento', 'Elimina un evento de Google Calendar.', 'mdi:calendar-remove', 'delete', 'DANGER', ARRAY['https://www.googleapis.com/auth/calendar.events']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_calendar'), 'get_calendar_event_details', 'Obtener detalle de evento', 'Obtiene los detalles completos de un evento.', 'mdi:calendar-text-outline', 'read', 'SAFE', ARRAY['https://www.googleapis.com/auth/calendar.events.readonly']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_catalog" ("id", "toolName", "displayName", "description", "provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'google_sheets', 'Google Sheets', 'Gestión y manipulación de hojas de cálculo en Google Sheets.', 'google', 'productivity', 'selfhst:google-sheets', true, false, now(), now())
ON CONFLICT ("toolName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "category" = EXCLUDED."category",
  "icon" = EXCLUDED."icon",
  "isActive" = EXCLUDED."isActive",
  "isInBeta" = EXCLUDED."isInBeta",
  "updatedAt" = now();

DELETE FROM "tool_functions"
WHERE "toolCatalogId" = (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets')
  AND "functionName" NOT IN ('read_sheet', 'append_row', 'update_sheet_range', 'create_spreadsheet', 'add_sheet', 'delete_sheet', 'clear_sheet_range', 'format_cells');

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'read_sheet', 'Leer hoja de cálculo', 'Lee datos de una hoja de cálculo en Google Sheets.', 'mdi:table-search', 'read', 'SAFE', ARRAY['https://www.googleapis.com/auth/spreadsheets.readonly']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'append_row', 'Añadir fila', 'Añade una fila al final de una hoja de cálculo.', 'mdi:table-row-plus-after', 'write', 'SAFE', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'update_sheet_range', 'Actualizar rango', 'Actualiza o sobrescribe un rango de celdas.', 'mdi:table-edit', 'write', 'WARNING', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'create_spreadsheet', 'Crear spreadsheet', 'Crea un nuevo archivo de hoja de cálculo.', 'mdi:file-table-outline', 'write', 'SAFE', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'add_sheet', 'Añadir pestaña', 'Añade una nueva pestaña dentro del spreadsheet.', 'mdi:tab-plus', 'write', 'SAFE', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'delete_sheet', 'Eliminar pestaña', 'Elimina una pestaña completa del spreadsheet.', 'mdi:tab-remove', 'delete', 'DANGER', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'clear_sheet_range', 'Limpiar rango', 'Limpia el contenido de un rango.', 'mdi:eraser', 'delete', 'DANGER', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

INSERT INTO "tool_functions" ("id", "toolCatalogId", "functionName", "displayName", "description", "icon", "category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT "id" FROM "tool_catalog" WHERE "toolName" = 'google_sheets'), 'format_cells', 'Formatear celdas', 'Aplica formatos (color, estilos, etc) a un rango.', 'mdi:format-paint', 'write', 'SAFE', ARRAY['https://www.googleapis.com/auth/spreadsheets']::text[], true, false, now(), now())
ON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "category" = EXCLUDED."category",
  "dangerLevel" = EXCLUDED."dangerLevel",
  "oauthScopes" = EXCLUDED."oauthScopes",
  "isActive" = true,
  "isInBeta" = false,
  "updatedAt" = now();

-- Templates de notificación

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0001', 1, 'Subscripcion', 'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicacion ya que formas parte fundamental de ella. Gracias por tu confianza.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0010', 1, 'Invitacion De Email.', 'La invitacion para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitacion, te lo haremos saber a traves de una notificacion.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0011', 1, 'Cancelacion De Invitacion.', 'La invitacion para %s ha sido reenviada exitosamente, por favor revisa tu correo electronico.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0100', 1, 'Cancelacion De Subscripcion.', 'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0101', 1, 'Cambio De Subscripcion.', 'La subscripcion %s ha sido cambiada (aun asi los beneficios de esta no seran cancelados hasta el inicio de la siguiente subscripcion). Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s a partir de %s al %s.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0110', 1, 'Aviso De Creditos Bajos.', 'Tu organizacion tiene pocos creditos disponibles. Te quedan %s creditos.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0111', 1, 'Reenvio De Invitacion.', 'La invitacion para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificacion.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0112', 1, 'Sin Creditos Disponibles.', 'Tu organizacion se ha quedado sin creditos disponibles. Adquiere creditos o actualiza tu plan para continuar ejecutando workflows.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0113', 1, 'Limite De Overage Alcanzado.', 'No se puede ejecutar el workflow porque se alcanzo el limite de overage (%s/%s).', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0114', 1, 'Intervencion Humana Requerida.', 'La conversacion %s del workflow %s requiere atencion humana. Motivo: %s.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0115', 1, 'Conversacion Requiere Seguimiento.', 'La conversacion %s del workflow %s quedo marcada para seguimiento. Motivo: %s.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0116', 1, 'Integracion Sin Acceso.', 'La integracion %s (%s) perdio el acceso y tu agente ya no puede usarla. Alguien revoco el permiso o cambio la contrasena de la cuenta. La conecto %s; para restablecerla hay que volver a conectarla desde Integraciones.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0117', 1, 'Pago Fallido.', 'No pudimos cobrar tu suscripcion. Tienes %s dias para actualizar tu metodo de pago antes de que se suspenda la ejecucion de tus workflows.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0118', 1, 'Servicio Suspendido Por Falta De Pago.', 'Tu suscripcion sigue sin pagarse y ya no puedes ejecutar workflows. Tu saldo de creditos no se perdio: se reactivara en cuanto actualices tu metodo de pago.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-0119', 1, 'Recarga De Creditos.', 'Se agregaron %s creditos a tu organizacion tras tu compra.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "notifications" ("id", "code", "version", "titleTemplate", "messageTemplate", "targetRoles", "isActive", "createdAt")
VALUES (gen_random_uuid(), '0000-1000', 1, 'Aceptacion De Invitacion.', 'La invitacion para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organizacion. Puedes gestionar su informacion desde el panel de administracion.', '["OWNER","ADMIN"]'::jsonb, true, now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";

COMMIT;
