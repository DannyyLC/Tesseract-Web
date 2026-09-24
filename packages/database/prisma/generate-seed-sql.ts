/**
 * Genera `seed.sql` a partir de `seed-data.ts`: el mismo seed que `seed.ts` aplica en local vía
 * Prisma Client, pero como SQL plano. El objetivo es que en prod el seed se corra exactamente
 * igual que ya se corren las migraciones a mano (ver docs/manuals/migraciones-gcp.md): pegar el
 * archivo en Cloud SQL Studio y ejecutarlo. Sin Cloud Run Job, sin ts-node, sin conectividad
 * especial — la instancia no expone IP pública, pero Studio corre dentro de la VPC.
 *
 * Uso: `pnpm run seed:generate` (desde packages/database). Vuelve a correrlo cada vez que cambie
 * `seed-data.ts` y commitea el `seed.sql` resultante junto con ese cambio.
 *
 * Todos los INSERT son upsert (ON CONFLICT ... DO UPDATE) sobre la misma clave única que usa el
 * seed de Prisma, así que correr el archivo de nuevo — con datos nuevos o sin ellos — es seguro.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL_EFFECTIVE_FROM, llmModels, toolCatalogs, notifications } from './seed-data';
import { notificationTranslationsEn, toolTranslationsEn } from './seed-translations-en';

/** Escapa comillas simples para un literal de texto Postgres. `null`/`undefined` -> `NULL`. */
function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlBool(value: boolean): string {
  return value ? 'true' : 'false';
}

function sqlArray(values: string[]): string {
  if (values.length === 0) return 'ARRAY[]::text[]';
  return `ARRAY[${values.map(sqlString).join(', ')}]::text[]`;
}

function sqlJsonb(value: unknown): string {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

/** `TIMESTAMP '2026-01-01 00:00:00.000'` — Postgres la acepta tal cual para una columna timestamp(3). */
function sqlTimestamp(date: Date): string {
  return `TIMESTAMP '${date.toISOString().replace('T', ' ').replace('Z', '')}'`;
}

function buildSql(): string {
  const lines: string[] = [];
  const push = (...statements: string[]) => lines.push(...statements, '');

  push(
    '-- Generado por packages/database/prisma/generate-seed-sql.ts a partir de seed-data.ts.',
    '-- NO EDITAR A MANO: los cambios se pierden en la siguiente generación. Para actualizar el',
    '-- seed, edita seed-data.ts y corre `pnpm run seed:generate` desde packages/database.',
    '--',
    '-- Uso en prod: Cloud SQL Studio (misma mecánica que las migraciones manuales, ver',
    '-- docs/manuals/migraciones-gcp.md) — pegar y ejecutar. Es idempotente: correrlo de nuevo',
    '-- sobre datos ya sembrados no duplica nada ni los reordena.',
    '',
    'BEGIN;',
    '',
  );

  // ── Categorías de modelos LLM ────────────────────────────────────────────
  push('-- Categorías de modelos LLM');
  const categoryNames = [...new Set(llmModels.map((m) => m.category))];
  for (const name of categoryNames) {
    push(
      `INSERT INTO "llm_model_categories" ("id", "name", "isActive", "createdAt", "updatedAt")` +
        `\nVALUES (gen_random_uuid(), ${sqlString(name)}, true, now(), now())` +
        `\nON CONFLICT ("name") DO UPDATE SET "isActive" = true, "updatedAt" = now();`,
    );
  }

  // ── Modelos LLM ──────────────────────────────────────────────────────────
  push('-- Modelos LLM');
  for (const model of llmModels) {
    push(
      `INSERT INTO "llm_models" (` +
        `"id", "provider", "modelName", "tier", "llmCategoryId", "inputPricePer1m", ` +
        `"outputPricePer1m", "contextWindow", "recommendedMaxTokens", "effectiveFrom", ` +
        `"effectiveTo", "isActive", "currency", "createdAt", "updatedAt")` +
        `\nVALUES (` +
        `gen_random_uuid(), ${sqlString(model.provider)}, ${sqlString(model.modelName)}, ` +
        `${sqlString(model.tier)}, ` +
        `(SELECT "id" FROM "llm_model_categories" WHERE "name" = ${sqlString(model.category)}), ` +
        `${model.inputPricePer1m}, ${model.outputPricePer1m}, ${model.contextWindow}, ` +
        `${model.recommendedMaxTokens}, ${sqlTimestamp(MODEL_EFFECTIVE_FROM)}, NULL, true, ` +
        `'USD', now(), now())` +
        `\nON CONFLICT ("provider", "modelName", "effectiveFrom") DO UPDATE SET` +
        `\n  "tier" = EXCLUDED."tier",` +
        `\n  "llmCategoryId" = EXCLUDED."llmCategoryId",` +
        `\n  "inputPricePer1m" = EXCLUDED."inputPricePer1m",` +
        `\n  "outputPricePer1m" = EXCLUDED."outputPricePer1m",` +
        `\n  "contextWindow" = EXCLUDED."contextWindow",` +
        `\n  "recommendedMaxTokens" = EXCLUDED."recommendedMaxTokens",` +
        `\n  "isActive" = true,` +
        `\n  "currency" = 'USD',` +
        `\n  "effectiveTo" = NULL,` +
        `\n  "updatedAt" = now();`,
    );
  }

  // ── Catálogo de tools y sus funciones ────────────────────────────────────
  push('-- Catálogo de tools y funciones');
  for (const catalog of toolCatalogs) {
    push(
      `INSERT INTO "tool_catalog" (` +
        `"id", "toolName", "displayName", "description", "displayNameEn", "descriptionEn", ` +
        `"provider", "category", "icon", "isActive", "isInBeta", "createdAt", "updatedAt")` +
        `\nVALUES (` +
        `gen_random_uuid(), ${sqlString(catalog.toolName)}, ${sqlString(catalog.displayName)}, ` +
        `${sqlString(catalog.description)}, ` +
        `${sqlString(toolTranslationsEn[catalog.toolName]?.displayName)}, ` +
        `${sqlString(toolTranslationsEn[catalog.toolName]?.description)}, ${sqlString(catalog.provider)}, ` +
        `${sqlString(catalog.category)}, ${sqlString(catalog.icon)}, ` +
        `${sqlBool(catalog.isActive)}, ${sqlBool(catalog.isInBeta)}, now(), now())` +
        `\nON CONFLICT ("toolName") DO UPDATE SET` +
        `\n  "displayName" = EXCLUDED."displayName",` +
        `\n  "description" = EXCLUDED."description",` +
        `\n  "displayNameEn" = EXCLUDED."displayNameEn",` +
        `\n  "descriptionEn" = EXCLUDED."descriptionEn",` +
        `\n  "provider" = EXCLUDED."provider",` +
        `\n  "category" = EXCLUDED."category",` +
        `\n  "icon" = EXCLUDED."icon",` +
        `\n  "isActive" = EXCLUDED."isActive",` +
        `\n  "isInBeta" = EXCLUDED."isInBeta",` +
        `\n  "updatedAt" = now();`,
    );

    const toolCatalogIdSubquery = `(SELECT "id" FROM "tool_catalog" WHERE "toolName" = ${sqlString(catalog.toolName)})`;
    const keptFunctionNames = catalog.functions.map((fn) => sqlString(fn.functionName)).join(', ');

    // Mismo criterio que seedToolCatalog() en seed.ts: las funciones que ya no están
    // declaradas para esta tool se borran, no se dejan huérfanas.
    push(
      `DELETE FROM "tool_functions"` +
        `\nWHERE "toolCatalogId" = ${toolCatalogIdSubquery}` +
        `\n  AND "functionName" NOT IN (${keptFunctionNames});`,
    );

    for (const fn of catalog.functions) {
      push(
        `INSERT INTO "tool_functions" (` +
          `"id", "toolCatalogId", "functionName", "displayName", "description", ` +
          `"displayNameEn", "descriptionEn", "icon", ` +
          `"category", "dangerLevel", "oauthScopes", "isActive", "isInBeta", "createdAt", "updatedAt")` +
          `\nVALUES (` +
          `gen_random_uuid(), ${toolCatalogIdSubquery}, ${sqlString(fn.functionName)}, ` +
          `${sqlString(fn.displayName)}, ${sqlString(fn.description)}, ` +
          `${sqlString(toolTranslationsEn[catalog.toolName]?.functions[fn.functionName]?.displayName)}, ` +
          `${sqlString(toolTranslationsEn[catalog.toolName]?.functions[fn.functionName]?.description)}, ` +
          `${sqlString(fn.icon)}, ` +
          `${sqlString(fn.category)}, ${sqlString(fn.dangerLevel)}, ${sqlArray(fn.oauthScopes ?? [])}, ` +
          `true, false, now(), now())` +
          `\nON CONFLICT ("toolCatalogId", "functionName") DO UPDATE SET` +
          `\n  "displayName" = EXCLUDED."displayName",` +
          `\n  "description" = EXCLUDED."description",` +
          `\n  "displayNameEn" = EXCLUDED."displayNameEn",` +
          `\n  "descriptionEn" = EXCLUDED."descriptionEn",` +
          `\n  "icon" = EXCLUDED."icon",` +
          `\n  "category" = EXCLUDED."category",` +
          `\n  "dangerLevel" = EXCLUDED."dangerLevel",` +
          `\n  "oauthScopes" = EXCLUDED."oauthScopes",` +
          `\n  "isActive" = true,` +
          `\n  "isInBeta" = false,` +
          `\n  "updatedAt" = now();`,
      );
    }
  }

  // ── Templates de notificación ────────────────────────────────────────────
  push('-- Templates de notificación');
  for (const item of notifications) {
    push(
      `INSERT INTO "notifications" (` +
        `"id", "code", "version", "titleTemplate", "messageTemplate", "titleTemplateEn", ` +
        `"messageTemplateEn", "targetRoles", "isActive", "createdAt")` +
        `\nVALUES (` +
        `gen_random_uuid(), ${sqlString(item.code)}, ${item.version}, ` +
        `${sqlString(item.titleTemplate)}, ${sqlString(item.messageTemplate)}, ` +
        `${sqlString(notificationTranslationsEn[item.code]?.title)}, ` +
        `${sqlString(notificationTranslationsEn[item.code]?.message)}, ` +
        `${sqlJsonb(item.targetRoles)}, ${sqlBool(item.isActive)}, now())` +
        `\nON CONFLICT ("code", "version") DO UPDATE SET` +
        `\n  "titleTemplate" = EXCLUDED."titleTemplate",` +
        `\n  "messageTemplate" = EXCLUDED."messageTemplate",` +
        `\n  "titleTemplateEn" = EXCLUDED."titleTemplateEn",` +
        `\n  "messageTemplateEn" = EXCLUDED."messageTemplateEn",` +
        `\n  "targetRoles" = EXCLUDED."targetRoles",` +
        `\n  "isActive" = EXCLUDED."isActive";`,
    );
  }

  push('COMMIT;');

  return lines.join('\n');
}

function main() {
  const sql = buildSql();
  const outPath = resolve(__dirname, 'seed.sql');
  writeFileSync(outPath, sql);
  console.log(`seed.sql generado en ${outPath}`);
}

main();
