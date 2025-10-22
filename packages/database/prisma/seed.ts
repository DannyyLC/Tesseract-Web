import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Empezando a sembrar datos de prueba...\n');

  // ============================================
  // 0. LIMPIAR DATOS ANTERIORES (IMPORTANTE)
  // ============================================
  console.log('🧹 Limpiando datos anteriores...');
  
  // Orden importante: eliminar en orden inverso a las relaciones
  await prisma.execution.deleteMany({});
  console.log('   ✓ Ejecuciones eliminadas');
  
  await prisma.workflow.deleteMany({});
  console.log('   ✓ Workflows eliminados');
  
  await prisma.client.deleteMany({});
  console.log('   ✓ Clientes eliminados');
  
  await prisma.tag.deleteMany({});
  console.log('   ✓ Tags eliminados\n');

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
      region: 'us-central',
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

  const marketingTag = await prisma.tag.create({
    data: { name: 'marketing' },
  });

  console.log(`✅ Tags creados: ${productionTag.name}, ${testTag.name}, ${marketingTag.name}\n`);

  // ============================================
  // 3. CREAR WORKFLOWS
  // ============================================
  console.log('⚙️  Creando workflows...');

  // Workflow 1: Procesamiento de Leads (Custom)
  const workflow1 = await prisma.workflow.create({
    data: {
      name: 'Procesar Leads de Formulario',
      description: 'Recibe datos del formulario web, extrae información con IA, y envía notificación',
      clientId: client.id,
      isActive: true,
      timezone: 'America/Mexico_City',
      config: {
        type: 'custom',
        steps: [
          {
            id: 'extract-data',
            type: 'ai',
            provider: 'openai',
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
        connect: [{ id: productionTag.id }, { id: marketingTag.id }],
      },
    },
  });

  console.log(`✅ Workflow 1 creado: ${workflow1.name}`);

  // Workflow 2: Scraping Diario (Custom con Schedule)
  const workflow2 = await prisma.workflow.create({
    data: {
      name: 'Scraping Diario de Competencia',
      description: 'Extrae precios de la competencia y genera reporte',
      clientId: client.id,
      isActive: true,
      schedule: '0 9 * * *', // Todos los días a las 9am
      timezone: 'America/Mexico_City',
      config: {
        type: 'custom',
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

  console.log(`✅ Workflow 2 creado: ${workflow2.name}`);

  // Workflow 3: Integración con n8n
  const workflow3 = await prisma.workflow.create({
    data: {
      name: 'Notificación de Ventas (n8n)',
      description: 'Workflow externo en n8n para notificar nuevas ventas',
      clientId: client.id,
      isActive: true,
      timezone: 'America/Mexico_City',
      config: {
        type: 'n8n',
        webhookUrl: 'https://n8n.acme.com/webhook/sales-notification-abc123',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer n8n-secret-token-xyz789',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        retryOnFail: true,
        retryDelay: 5000,
        maxRetries: 3,
      },
      tags: {
        connect: [{ id: productionTag.id }],
      },
    },
  });

  console.log(`✅ Workflow 3 creado: ${workflow3.name}\n`);

  // ============================================
  // 4. CREAR EJECUCIONES
  // ============================================
  console.log('🚀 Creando ejecuciones de ejemplo...');

  // Ejecución exitosa del workflow 1
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
      stepResults: {
        'extract-data': {
          status: 'success',
          duration: 8,
          tokensUsed: 150,
          output: {
            name: 'Juan Pérez',
            email: 'juan@example.com',
            phone: '+52 123 456 7890',
          },
        },
        'save-to-crm': {
          status: 'success',
          duration: 3,
          recordId: 'lead-12345',
        },
        'notify-team': {
          status: 'success',
          duration: 4,
          emailId: 'email-abc-789',
        },
      },
      cost: 0.002,
      triggerData: {
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        formData: {
          source: 'landing-page',
          campaign: 'summer-promo',
        },
      },
      logs: '[10:00:00] Workflow started\n[10:00:08] AI extraction completed\n[10:00:11] Saved to CRM\n[10:00:15] Email sent successfully',
    },
  });

  console.log(`✅ Ejecución 1: ${execution1.status} (${execution1.duration}s)`);

  // Ejecución fallida del workflow 1
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
      stepResults: {
        'extract-data': {
          status: 'failed',
          duration: 10,
          error: 'timeout',
          retries: 1,
        },
      },
      retryCount: 1,
      cost: 0.001,
      logs: '[11:00:00] Workflow started\n[11:00:02] Calling OpenAI API\n[11:00:32] Error: API timeout',
    },
  });

  console.log(`✅ Ejecución 2: ${execution2.status} (error: timeout)`);

  // Ejecución en progreso del workflow 2
  const execution3 = await prisma.execution.create({
    data: {
      workflowId: workflow2.id,
      status: 'running',
      trigger: 'schedule',
      startedAt: new Date(),
      logs: '[09:00:00] Scheduled execution started\n[09:00:01] Scraping competitor website\n[09:00:15] Extracting 50 products...',
      stepResults: {
        'scrape-prices': {
          status: 'success',
          duration: 15,
          productsFound: 50,
        },
      },
    },
  });

  console.log(`✅ Ejecución 3: ${execution3.status}`);

  // Ejecución cancelada del workflow 2
  const execution4 = await prisma.execution.create({
    data: {
      workflowId: workflow2.id,
      status: 'cancelled',
      trigger: 'manual',
      startedAt: new Date('2025-10-21T08:00:00Z'),
      finishedAt: new Date('2025-10-21T08:00:30Z'),
      duration: 30,
      logs: '[08:00:00] Manual execution started\n[08:00:20] User cancelled execution\n[08:00:30] Cleanup completed',
      stepResults: {
        'scrape-prices': {
          status: 'cancelled',
          duration: 30,
          productsFound: 15,
          note: 'Cancelled by user before completion',
        },
      },
    },
  });

  console.log(`✅ Ejecución 4: ${execution4.status}`);

  // Ejecución exitosa del workflow n8n
  const execution5 = await prisma.execution.create({
    data: {
      workflowId: workflow3.id,
      status: 'completed',
      trigger: 'api',
      startedAt: new Date('2025-10-21T12:00:00Z'),
      finishedAt: new Date('2025-10-21T12:00:05Z'),
      duration: 5,
      result: {
        n8nResponse: {
          success: true,
          executionId: 'n8n-exec-456',
          message: 'Notification sent successfully',
        },
      },
      cost: 0.0005,
      logs: '[12:00:00] Calling n8n webhook\n[12:00:05] n8n responded successfully',
    },
  });

  console.log(`✅ Ejecución 5: ${execution5.status} (n8n workflow)\n`);

  // ============================================
  // 5. ACTUALIZAR ESTADÍSTICAS DE WORKFLOWS
  // ============================================
  console.log('📊 Actualizando estadísticas de workflows...');

  await prisma.workflow.update({
    where: { id: workflow1.id },
    data: {
      totalExecutions: 2,
      successfulExecutions: 1,
      failedExecutions: 1,
      lastExecutedAt: new Date('2025-10-21T11:00:00Z'),
      avgExecutionTime: 12,
    },
  });

  await prisma.workflow.update({
    where: { id: workflow2.id },
    data: {
      totalExecutions: 2,
      successfulExecutions: 0,
      failedExecutions: 0,
      lastExecutedAt: new Date(),
      avgExecutionTime: 30,
    },
  });

  await prisma.workflow.update({
    where: { id: workflow3.id },
    data: {
      totalExecutions: 1,
      successfulExecutions: 1,
      failedExecutions: 0,
      lastExecutedAt: new Date('2025-10-21T12:00:00Z'),
      avgExecutionTime: 5,
    },
  });

  console.log('✅ Estadísticas actualizadas\n');

  // ============================================
  // RESUMEN FINAL
  // ============================================
  console.log('═══════════════════════════════════════════════════════');
  console.log('✨ ¡Datos de prueba creados exitosamente!\n');
  console.log('📊 RESUMEN:');
  console.log('───────────────────────────────────────────────────────');
  console.log(`👤 Cliente: ${client.name}`);
  console.log(`   Email: ${client.email}`);
  console.log(`   Plan: ${client.plan}`);
  console.log(`   🔑 API Key: ${client.apiKey}\n`);
  
  console.log('⚙️  Workflows creados: 3');
  console.log(`   1. ${workflow1.name} (custom)`);
  console.log(`   2. ${workflow2.name} (custom + schedule)`);
  console.log(`   3. ${workflow3.name} (n8n)`);
  
  console.log('\n🚀 Ejecuciones creadas: 5');
  console.log('   • 2 completadas');
  console.log('   • 1 fallida');
  console.log('   • 1 en progreso');
  console.log('   • 1 cancelada');
  
  console.log(`\n🏷️  Tags: ${productionTag.name}, ${testTag.name}, ${marketingTag.name}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('🎯 PRÓXIMOS PASOS:');
  console.log('   1. Ver datos visualmente:');
  console.log('      npm run prisma:studio\n');
  console.log('   2. Probar el API (cuando lo desarrolles):');
  console.log(`      curl -H "x-api-key: ${client.apiKey}" http://localhost:3000/api/workflows\n`);
  console.log('   3. Volver a ejecutar seed (limpia y recrea):');
  console.log('      npm run prisma:seed\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Error al sembrar datos:', e);
    console.error('\n💡 TIP: Si el error es de constraint, ejecuta:');
    console.error('   npm run prisma:reset');
    console.error('   npm run prisma:seed\n');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });