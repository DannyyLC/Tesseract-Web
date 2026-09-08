import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { MODEL_EFFECTIVE_FROM, llmModels, toolCatalogs, notifications } from './seed-data';

// El .env vive en la raíz del monorepo (mismo criterio que prisma.config.ts)
config({ path: resolve(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('Seed failed: falta DATABASE_URL (revisa el .env de la raíz).');
  process.exit(1);
}

// Prisma 7 exige un driver adapter: sin él, el constructor lanza
// "PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions".
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function seedModels() {
  // 1. Upsert de categorías (a partir de los valores distintos del seed) y
  //    construcción de un mapa nombre -> id para enlazar los modelos.
  const categoryNames = [...new Set(llmModels.map((m) => m.category))];
  const categoryIdByName = new Map<string, string>();
  for (const name of categoryNames) {
    const category = await prisma.llmModelCategory.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
    categoryIdByName.set(name, category.id);
  }

  // 2. Upsert de modelos, enlazando por llmCategoryId.
  for (const model of llmModels) {
    const { category, ...modelData } = model;
    const llmCategoryId = categoryIdByName.get(category) ?? null;
    await prisma.llmModel.upsert({
      where: {
        provider_modelName_effectiveFrom: {
          provider: model.provider,
          modelName: model.modelName,
          effectiveFrom: MODEL_EFFECTIVE_FROM,
        },
      },
      create: {
        ...modelData,
        llmCategoryId,
        effectiveFrom: MODEL_EFFECTIVE_FROM,
        isActive: true,
        currency: 'USD',
      },
      update: {
        tier: model.tier,
        llmCategoryId,
        inputPricePer1m: model.inputPricePer1m,
        outputPricePer1m: model.outputPricePer1m,
        contextWindow: model.contextWindow,
        recommendedMaxTokens: model.recommendedMaxTokens,
        isActive: true,
        currency: 'USD',
        effectiveTo: null,
      },
    });
  }
}

async function seedToolCatalog() {
  for (const catalog of toolCatalogs) {
    const savedCatalog = await prisma.toolCatalog.upsert({
      where: { toolName: catalog.toolName },
      create: {
        toolName: catalog.toolName,
        displayName: catalog.displayName,
        description: catalog.description,
        provider: catalog.provider,
        category: catalog.category,
        icon: catalog.icon,
        isActive: catalog.isActive,
        isInBeta: catalog.isInBeta,
      },
      update: {
        displayName: catalog.displayName,
        description: catalog.description,
        provider: catalog.provider,
        category: catalog.category,
        icon: catalog.icon,
        isActive: catalog.isActive,
        isInBeta: catalog.isInBeta,
      },
    });

    const catalogFunctionNames = catalog.functions.map((fn) => fn.functionName);

    await prisma.toolFunction.deleteMany({
      where: {
        toolCatalogId: savedCatalog.id,
        functionName: { notIn: catalogFunctionNames },
      },
    });

    for (const fn of catalog.functions) {
      await prisma.toolFunction.upsert({
        where: {
          toolCatalogId_functionName: {
            toolCatalogId: savedCatalog.id,
            functionName: fn.functionName,
          },
        },
        create: {
          toolCatalogId: savedCatalog.id,
          functionName: fn.functionName,
          displayName: fn.displayName,
          description: fn.description,
          icon: fn.icon,
          category: fn.category,
          dangerLevel: fn.dangerLevel,
          oauthScopes: fn.oauthScopes ?? [],
          isActive: true,
          isInBeta: false,
        },
        update: {
          displayName: fn.displayName,
          description: fn.description,
          icon: fn.icon,
          category: fn.category,
          dangerLevel: fn.dangerLevel,
          oauthScopes: fn.oauthScopes ?? [],
          isActive: true,
          isInBeta: false,
        },
      });
    }
  }
}

async function seedNotifications() {
  for (const item of notifications) {
    await prisma.notification.upsert({
      where: {
        code_version: {
          code: item.code,
          version: item.version,
        },
      },
      create: {
        code: item.code,
        version: item.version,
        titleTemplate: item.titleTemplate,
        messageTemplate: item.messageTemplate,
        targetRoles: item.targetRoles,
        isActive: item.isActive,
      },
      update: {
        titleTemplate: item.titleTemplate,
        messageTemplate: item.messageTemplate,
        targetRoles: item.targetRoles,
        isActive: item.isActive,
      },
    });
  }
}

async function main() {
  console.log('Starting shared global seed...');

  console.log('Seeding LLM models...');
  await seedModels();
  console.log(`LLM models upserted: ${llmModels.length}`);

  console.log('Seeding tool catalog and functions...');
  await seedToolCatalog();
  console.log(`Tool catalogs upserted: ${toolCatalogs.length}`);
  console.log(
    `Tool functions upserted: ${toolCatalogs.reduce((total, t) => total + t.functions.length, 0)}`,
  );

  console.log('Seeding notification templates...');
  await seedNotifications();
  console.log(`Notification templates upserted: ${notifications.length}`);

  console.log('Shared global seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
