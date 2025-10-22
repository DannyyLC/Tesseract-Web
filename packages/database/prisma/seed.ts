import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...\n');

  // Limpiar datos existentes (opcional)
  console.log('🧹 Limpiando datos existentes...');
  await prisma.execution.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.whatsAppConfig.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.client.deleteMany();
  console.log('✅ Datos limpiados\n');

  // ============================================
  // CREAR CLIENTES
  // ============================================
  console.log('👥 Creando clientes...');

  // Cliente 1: Plan Free
  const client1Password = 'Password123!';
  const client1 = await prisma.client.create({
    data: {
      name: 'Acme Corp',
      email: 'admin@acme.com',
      password: await bcrypt.hash(client1Password, 10),
      emailVerified: true,
      plan: 'free',
      maxWorkflows: 10,
      maxExecutionsPerDay: 100,
      maxApiKeys: 3,
      isActive: true,
      region: 'us-central',
    },
  });
  console.log(`✅ Cliente creado: ${client1.name} (${client1.email})`);
  console.log(`   Password: ${client1Password}\n`);

  // Cliente 2: Plan Pro
  const client2Password = 'SecurePass456!';
  const client2 = await prisma.client.create({
    data: {
      name: 'TechStart Inc',
      email: 'tech@techstart.io',
      password: await bcrypt.hash(client2Password, 10),
      emailVerified: true,
      plan: 'pro',
      maxWorkflows: 50,
      maxExecutionsPerDay: 1000,
      maxApiKeys: 10,
      isActive: true,
      region: 'us-east',
    },
  });
  console.log(`✅ Cliente creado: ${client2.name} (${client2.email})`);
  console.log(`   Password: ${client2Password}\n`);

  // ============================================
  // CREAR API KEYS
  // ============================================
  console.log('🔑 Creando API Keys...');

  // API Key 1 para Acme Corp (Producción)
  const apiKey1 = 'ak_live_acme_prod_xyz789abc123def456ghi';
  const apiKey1Hash = await bcrypt.hash(apiKey1, 10);
  await prisma.apiKey.create({
    data: {
      name: 'Producción Web',
      keyHash: apiKey1Hash,
      keyPrefix: apiKey1.substring(0, 10),
      isActive: true,
      clientId: client1.id,
    },
  });
  console.log(`✅ API Key creada para ${client1.name}: ${apiKey1}`);

  // API Key 2 para Acme Corp (Testing)
  const apiKey2 = 'ak_test_acme_test_123abc456def789ghi012';
  const apiKey2Hash = await bcrypt.hash(apiKey2, 10);
  await prisma.apiKey.create({
    data: {
      name: 'Testing',
      keyHash: apiKey2Hash,
      keyPrefix: apiKey2.substring(0, 10),
      isActive: true,
      clientId: client1.id,
    },
  });
  console.log(`✅ API Key creada para ${client1.name}: ${apiKey2}`);

  // API Key 3 para TechStart
  const apiKey3 = 'ak_live_tech_prod_999zzz888yyy777xxx';
  const apiKey3Hash = await bcrypt.hash(apiKey3, 10);
  await prisma.apiKey.create({
    data: {
      name: 'Producción',
      keyHash: apiKey3Hash,
      keyPrefix: apiKey3.substring(0, 10),
      isActive: true,
      clientId: client2.id,
    },
  });
  console.log(`✅ API Key creada para ${client2.name}: ${apiKey3}\n`);

  // ============================================
  // CREAR TAGS
  // ============================================
  console.log('🏷️  Creando tags...');

  const tagLeads = await prisma.tag.create({
    data: {
      name: 'leads',
      color: '#3B82F6',
    },
  });

  const tagMarketing = await prisma.tag.create({
    data: {
      name: 'marketing',
      color: '#10B981',
    },
  });

  const tagAutomation = await prisma.tag.create({
    data: {
      name: 'automation',
      color: '#F59E0B',
    },
  });

  console.log('✅ Tags creados\n');

  // ============================================
  // CREAR WORKFLOWS
  // ============================================
  console.log('⚙️  Creando workflows...');

  // Workflow 1: Tipo n8n
  const workflow1 = await prisma.workflow.create({
    data: {
      name: 'Procesador de Leads',
      description: 'Workflow que procesa leads desde formulario web',
      config: {
        type: 'n8n',
        webhookUrl: 'https://n8n.acme.com/webhook/lead-processor',
        method: 'POST',
        headers: {
          Authorization: 'Bearer n8n-secret-token-123',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        retryOnFail: true,
        maxRetries: 3,
      },
      version: 1,
      isActive: true,
      triggerType: 'webhook',
      clientId: client1.id,
      tags: {
        connect: [{ id: tagLeads.id }, { id: tagAutomation.id }],
      },
    },
  });
  console.log(`✅ Workflow creado: ${workflow1.name}`);

  // Workflow 2: Tipo custom
  const workflow2 = await prisma.workflow.create({
    data: {
      name: 'Análisis de Sentimientos IA',
      description: 'Analiza sentimientos de comentarios con GPT-4',
      config: {
        type: 'custom',
        steps: [
          {
            id: 'extract-text',
            type: 'transform',
            operation: 'parse',
            input: '{input}',
          },
          {
            id: 'analyze-sentiment',
            type: 'ai',
            provider: 'openai',
            model: 'gpt-4',
            prompt: 'Analiza el sentimiento del siguiente texto: {extract-text.result}',
            temperature: 0.7,
            maxTokens: 500,
          },
          {
            id: 'save-result',
            type: 'database',
            action: 'insert',
            table: 'sentiment_analysis',
            data: {
              text: '{extract-text.result}',
              sentiment: '{analyze-sentiment.sentiment}',
              score: '{analyze-sentiment.score}',
            },
          },
        ],
      },
      version: 1,
      isActive: true,
      triggerType: 'api',
      clientId: client1.id,
      tags: {
        connect: [{ id: tagAutomation.id }],
      },
    },
  });
  console.log(`✅ Workflow creado: ${workflow2.name}`);

  // Workflow 3: Con schedule
  const workflow3 = await prisma.workflow.create({
    data: {
      name: 'Reporte Diario de Ventas',
      description: 'Genera reporte de ventas todos los días a las 8am',
      config: {
        type: 'custom',
        steps: [
          {
            id: 'fetch-sales',
            type: 'database',
            action: 'query',
            table: 'sales',
            where: {
              date: '{today}',
            },
          },
          {
            id: 'generate-report',
            type: 'transform',
            operation: 'aggregate',
            input: '{fetch-sales.result}',
          },
          {
            id: 'send-email',
            type: 'notification',
            method: 'email',
            to: 'sales@techstart.io',
            subject: 'Reporte de Ventas - {today}',
            template: 'daily-sales-report',
          },
        ],
      },
      version: 1,
      isActive: true,
      schedule: '0 8 * * *', // Todos los días a las 8am
      timezone: 'America/Mexico_City',
      triggerType: 'schedule',
      clientId: client2.id,
      tags: {
        connect: [{ id: tagMarketing.id }],
      },
    },
  });
  console.log(`✅ Workflow creado: ${workflow3.name}\n`);

  // ============================================
  // CREAR EJECUCIONES DE EJEMPLO
  // ============================================
  console.log('📊 Creando ejecuciones de ejemplo...');

  // Ejecución exitosa
  await prisma.execution.create({
    data: {
      status: 'completed',
      startedAt: new Date(Date.now() - 3600000), // Hace 1 hora
      finishedAt: new Date(Date.now() - 3540000), // Hace 59 minutos
      duration: 60,
      result: {
        leadProcessed: true,
        leadId: 'lead-123',
        score: 8.5,
      },
      trigger: 'webhook',
      triggerData: {
        ip: '192.168.1.100',
        payload: {
          name: 'Juan Pérez',
          email: 'juan@example.com',
        },
      },
      workflowId: workflow1.id,
    },
  });

  // Ejecución fallida
  await prisma.execution.create({
    data: {
      status: 'failed',
      startedAt: new Date(Date.now() - 1800000), // Hace 30 minutos
      finishedAt: new Date(Date.now() - 1740000), // Hace 29 minutos
      duration: 60,
      error: 'API rate limit exceeded',
      errorStack: 'Error: Rate limit exceeded at OpenAI API...',
      trigger: 'api',
      retryCount: 3,
      workflowId: workflow2.id,
    },
  });

  // Ejecución en progreso
  await prisma.execution.create({
    data: {
      status: 'running',
      startedAt: new Date(),
      trigger: 'schedule',
      workflowId: workflow3.id,
    },
  });

  console.log('✅ Ejecuciones creadas\n');

  // ============================================
  // RESUMEN FINAL
  // ============================================
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════\n');

  console.log('📋 CREDENCIALES PARA TESTING:\n');
  
  console.log('👤 Cliente 1: Acme Corp');
  console.log(`   Email: ${client1.email}`);
  console.log(`   Password: ${client1Password}`);
  console.log(`   API Key (Prod): ${apiKey1}`);
  console.log(`   API Key (Test): ${apiKey2}\n`);

  console.log('👤 Cliente 2: TechStart Inc');
  console.log(`   Email: ${client2.email}`);
  console.log(`   Password: ${client2Password}`);
  console.log(`   API Key (Prod): ${apiKey3}\n`);

  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });