import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Empezando a sembrar datos de prueba...\n');

  // ============================================
  // 1. CREAR UN CLIENTE
  // ============================================
  console.log('📦 Creando cliente de prueba...');
  
  const client = await prisma.client.create({
    data: {
      name: 'Acme Corporation',
      email: 'admin@acme.com',
      plan: 'pro',
      maxWorkflows: 50,
      maxExecutionsPerDay: 1000,
      metadata: {
        industry: 'tech',
        companySize: '50-100',
        country: 'Mexico',
      },
    },
  });

  console.log(`✅ Cliente creado: ${client.name} (ID: ${client.id})`);
  console.log(`   API Key: ${client.apiKey}\n`);

  // ============================================
  // 2. CREAR TAGS
  // ============================================
  console.log('🏷️  Creando tags...');
  
  const productionTag = await prisma.tag.create({
    data: { name: 'production' },
  });

  const testTag = await prisma.tag.create({
    data: { name: 'testing' },
  });

  console.log(`✅ Tags creados: ${productionTag.name}, ${testTag.name}\n`);

  // ============================================
  // 3. CREAR WORKFLOWS
  // ============================================
  console.log('⚙️  Creando workflows...');

  // Workflow 1: Procesamiento de Leads
  const workflow1 = await prisma.workflow.create({
    data: {
      name: 'Procesar Leads de Formulario',
      description: 'Recibe datos del formulario web, extrae información con IA, y envía notificación',
      clientId: client.id,
      isActive: true,
      config: {
        trigger: {
          type: 'webhook',
          url: '/webhooks/form-submit',
        },
        steps: [
          {
            id: 'extract-data',
            type: 'ai',
            model: 'gpt-4',
            prompt: 'Extrae el nombre, email y teléfono del siguiente texto',
          },
          {
            id: 'save-to-crm',
            type: 'database',
            action: 'insert',
            table: 'leads',
          },
          {
            id: 'notify-team',
            type: 'notification',
            method: 'email',
            to: 'sales@acme.com',
          },
        ],
      },
      tags: {
        connect: [{ id: productionTag.id }],
      },
    },
  });

  console.log(`✅ Workflow 1 creado: ${workflow1.name}`);

  // Workflow 2: Scraping Diario
  const workflow2 = await prisma.workflow.create({
    data: {
      name: 'Scraping Diario de Competencia',
      description: 'Extrae precios de la competencia y genera reporte',
      clientId: client.id,
      isActive: true,
      schedule: '0 9 * * *', // Todos los días a las 9am
      timezone: 'America/Mexico_City',
      config: {
        trigger: {
          type: 'schedule',
          cron: '0 9 * * *',
        },
        steps: [
          {
            id: 'scrape-prices',
            type: 'scraping',
            url: 'https://competitor.com/products',
            selectors: {
              price: '.product-price',
              name: '.product-name',
            },
          },
          {
            id: 'generate-report',
            type: 'transform',
            operation: 'compare-prices',
          },
          {
            id: 'send-report',
            type: 'notification',
            method: 'email',
            to: 'analytics@acme.com',
          },
        ],
      },
      tags: {
        connect: [{ id: testTag.id }],
      },
    },
  });

  console.log(`✅ Workflow 2 creado: ${workflow2.name}\n`);

  // ============================================
  // 4. CREAR EJECUCIONES
  // ============================================
  console.log('🚀 Creando ejecuciones de ejemplo...');

  // Ejecución exitosa
  const execution1 = await prisma.execution.create({
    data: {
      workflowId: workflow1.id,
      status: 'completed',
      trigger: 'webhook',
      startedAt: new Date('2025-10-21T10:00:00Z'),
      finishedAt: new Date('2025-10-21T10:00:15Z'),
      duration: 15,
      result: {
        leadsProcessed: 1,
        emailSent: true,
        leadData: {
          name: 'Juan Pérez',
          email: 'juan@example.com',
          phone: '+52 123 456 7890',
        },
      },
      stepResults: [
        { step: 'extract-data', status: 'success', duration: 8 },
        { step: 'save-to-crm', status: 'success', duration: 3 },
        { step: 'notify-team', status: 'success', duration: 4 },
      ],
      cost: 0.002,
      triggerData: {
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      },
    },
  });

  console.log(`✅ Ejecución 1 creada: ${execution1.status} (${execution1.duration}s)`);

  // Ejecución fallida
  const execution2 = await prisma.execution.create({
    data: {
      workflowId: workflow1.id,
      status: 'failed',
      trigger: 'webhook',
      startedAt: new Date('2025-10-21T11:00:00Z'),
      finishedAt: new Date('2025-10-21T11:00:10Z'),
      duration: 10,
      error: 'OpenAI API timeout after 30 seconds',
      errorStack: 'Error: timeout\n  at callOpenAI (worker.ts:45)\n  at processStep (executor.ts:123)',
      stepResults: [
        { step: 'extract-data', status: 'failed', duration: 10, error: 'timeout' },
      ],
      retryCount: 1,
      cost: 0.001,
    },
  });

  console.log(`✅ Ejecución 2 creada: ${execution2.status} (error: ${execution2.error})`);

  // Ejecución en progreso
  const execution3 = await prisma.execution.create({
    data: {
      workflowId: workflow2.id,
      status: 'running',
      trigger: 'schedule',
      startedAt: new Date(),
      logs: 'Step 1: Scraping started...\nStep 2: Extracting data...',
    },
  });

  console.log(`✅ Ejecución 3 creada: ${execution3.status}\n`);

  // ============================================
  // 5. ACTUALIZAR ESTADÍSTICAS DEL WORKFLOW
  // ============================================
  console.log('📊 Actualizando estadísticas de workflows...');

  await prisma.workflow.update({
    where: { id: workflow1.id },
    data: {
      totalExecutions: 2,
      successfulExecutions: 1,
      failedExecutions: 1,
      lastExecutedAt: new Date('2025-10-21T11:00:00Z'),
      avgExecutionTime: 12, // Promedio de 15s y 10s
    },
  });

  console.log('✅ Estadísticas actualizadas\n');

  // ============================================
  // RESUMEN
  // ============================================
  console.log('✨ ¡Datos de prueba creados exitosamente!\n');
  console.log('📊 Resumen:');
  console.log(`   - 1 Cliente: ${client.name}`);
  console.log(`   - 2 Workflows: "${workflow1.name}", "${workflow2.name}"`);
  console.log(`   - 3 Ejecuciones: 1 completada, 1 fallida, 1 en progreso`);
  console.log(`   - 2 Tags: ${productionTag.name}, ${testTag.name}\n`);
  console.log('🎯 Próximo paso: Ejecuta "npx prisma studio" para ver los datos visualmente');
}

main()
  .catch((e) => {
    console.error('❌ Error al sembrar datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });