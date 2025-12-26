import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...\n');

  // Limpiar datos existentes (opcional)
  console.log('🧹 Limpiando datos existentes...');
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.tenantTool.deleteMany();
  await prisma.toolFunction.deleteMany();
  await prisma.toolCatalog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.whatsAppConfig.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('✅ Datos limpiados\n');

  // ============================================
  // CREAR ORGANIZACIONES
  // ============================================
  console.log('🏢 Creando organizaciones...');

  // Organización 1: Plan Free
  const org1 = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'free',
      isActive: true,
      region: 'us-central',
    },
  });
  console.log(`✅ Organización creada: ${org1.name}\n`);

  // Organización 2: Plan Pro
  const org2 = await prisma.organization.create({
    data: {
      name: 'TechStart Inc',
      slug: 'techstart-inc',
      plan: 'pro',
      isActive: true,
      region: 'us-east',
      maxUsers: 10,
      maxWorkflows: 50,
      maxExecutionsPerDay: 1000,
      maxApiKeys: 10,
    },
  });
  console.log(`✅ Organización creada: ${org2.name}\n`);

  // ============================================
  // CREAR USUARIOS
  // ============================================
  console.log('👥 Creando usuarios...');

  const user1Password = 'Password123!';
  const user1 = await prisma.user.create({
    data: {
      email: 'admin@acme.com',
      password: await bcrypt.hash(user1Password, 10),
      name: 'Admin Acme',
      emailVerified: true,
      role: 'admin',
      isActive: true,
      organizationId: org1.id,
    },
  });
  console.log(`✅ Usuario creado: ${user1.name} (${user1.email})`);
  console.log(`   Password: ${user1Password}\n`);

  const user2Password = 'SecurePass456!';
  const user2 = await prisma.user.create({
    data: {
      email: 'tech@techstart.io',
      password: await bcrypt.hash(user2Password, 10),
      name: 'Admin TechStart',
      emailVerified: true,
      role: 'admin',
      isActive: true,
      organizationId: org2.id,
    },
  });
  console.log(`✅ Usuario creado: ${user2.name} (${user2.email})`);
  console.log(`   Password: ${user2Password}\n`);

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
      keyPrefix: apiKey1.substring(0, 16),
      isActive: true,
      organizationId: org1.id,
    },
  });
  console.log(`✅ API Key creada para ${org1.name}: ${apiKey1}`);

  // API Key 2 para Acme Corp (Testing)
  const apiKey2 = 'ak_test_acme_test_123abc456def789ghi012';
  const apiKey2Hash = await bcrypt.hash(apiKey2, 10);
  await prisma.apiKey.create({
    data: {
      name: 'Testing',
      keyHash: apiKey2Hash,
      keyPrefix: apiKey2.substring(0, 16),
      isActive: true,
      organizationId: org1.id,
    },
  });
  console.log(`✅ API Key creada para ${org1.name}: ${apiKey2}`);

  // API Key 3 para TechStart
  const apiKey3 = 'ak_live_tech_prod_999zzz888yyy777xxx';
  const apiKey3Hash = await bcrypt.hash(apiKey3, 10);
  await prisma.apiKey.create({
    data: {
      name: 'Producción',
      keyHash: apiKey3Hash,
      keyPrefix: apiKey3.substring(0, 16),
      isActive: true,
      organizationId: org2.id,
    },
  });
  console.log(`✅ API Key creada para ${org2.name}: ${apiKey3}\n`);

  // ============================================
  // CREAR TOOL CATALOG (Catálogo de herramientas)
  // ============================================
  console.log('🧰 Creando catálogo de herramientas...');

  const toolCalculator = await prisma.toolCatalog.create({
    data: {
      toolName: 'calculator',
      displayName: 'Calculator',
      description: 'Herramienta de cálculo matemático. Soporta operaciones básicas, porcentajes y conversiones de moneda.',
      provider: 'custom',
      category: 'utility',
      icon: 'https://api.iconify.design/mdi:calculator.svg',
      isActive: true,
      isInBeta: false,
      functions: {
        create: [
          {
            functionName: 'calculator',
            displayName: 'Calcular expresión',
            description: 'Evalúa expresiones matemáticas de forma segura. Soporta: +, -, *, /, paréntesis, decimales, módulo y potencias.',
            category: 'calculation',
            isActive: true,
            isInBeta: false,
            dangerLevel: 'safe',
          },
          {
            functionName: 'percentage',
            displayName: 'Calcular porcentaje',
            description: 'Calcula el porcentaje de un valor.',
            category: 'calculation',
            isActive: true,
            isInBeta: false,
            dangerLevel: 'safe',
          },
          {
            functionName: 'currency_convert',
            displayName: 'Convertir moneda',
            description: 'Convierte entre monedas (versión mock para testing).',
            category: 'conversion',
            isActive: true,
            isInBeta: false,
            dangerLevel: 'safe',
          },
        ],
      },
    },
  });
  console.log(`✅ Tool creada: ${toolCalculator.displayName}\n`);

  // ============================================
  // CREAR TENANT TOOLS (Conexiones a herramientas)
  // ============================================
  console.log('🔗 Creando conexiones de herramientas...');

  const tenantToolCalc1 = await prisma.tenantTool.create({
    data: {
      toolCatalogId: toolCalculator.id,
      displayName: 'Calculator - Acme',
      credentialPath: null,
      config: Prisma.JsonNull,
      isConnected: true,
      connectedAt: new Date(),
      organizationId: org1.id,
    },
  });
  console.log(`✅ TenantTool creado: ${tenantToolCalc1.displayName} para ${org1.name}\n`);

  // ============================================
  // CREAR TAGS
  // ============================================
  console.log('🏷️  Creando tags...');

  const tagTest = await prisma.tag.create({
    data: {
      name: 'test',
      color: '#3B82F6',
    },
  });

  const tagMath = await prisma.tag.create({
    data: {
      name: 'math',
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

  // Workflow 1: Agente matemático con Calculator
  const workflow1 = await prisma.workflow.create({
    data: {
      name: 'Agente Matemático - Calculator',
      description: 'Agente que ayuda con cálculos matemáticos usando la herramienta Calculator',
      config: {
        type: 'agent',
        agent: {
          graph_type: 'react',
          max_iterations: 10,
          allow_interrupts: false,
        },
        models: {
          default: {
            systemPrompt: 'Eres un asistente matemático experto. Ayudas a los usuarios a realizar cálculos, calcular porcentajes y convertir monedas. Usa la herramienta calculator cuando necesites hacer operaciones matemáticas.',
            model: 'gpt-4o-mini',
            temperature: 0.3,
            maxTokensPerMessage: 1000,
            responseFormat: 'text',
          },
        },
      },
      toolPermissions: Prisma.JsonNull,
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api'],
      timeout: 300,
      maxRetries: 3,
      organizationId: org1.id,
      tenantTools: {
        connect: [{ id: tenantToolCalc1.id }],
      },
      tags: {
        connect: [{ id: tagTest.id }, { id: tagMath.id }],
      },
    },
  });
  console.log(`✅ Workflow creado: ${workflow1.name}`);
  console.log(`   ID: ${workflow1.id}\n`);

  // Workflow 2: Agente con permisos específicos
  const workflow2 = await prisma.workflow.create({
    data: {
      name: 'Agente Porcentajes - Solo Percentage',
      description: 'Agente que solo puede calcular porcentajes (función limitada)',
      config: {
        type: 'agent',
        agent: {
          graph_type: 'react',
          max_iterations: 5,
          allow_interrupts: false,
        },
        models: {
          default: {
            systemPrompt: 'Eres un asistente especializado en calcular porcentajes. Solo puedes ayudar con cálculos de porcentajes.',
            model: 'gpt-4o-mini',
            temperature: 0.3,
            maxTokensPerMessage: 500,
            responseFormat: 'text',
          },
        },
      },
      toolPermissions: {
        [tenantToolCalc1.id]: ['percentage'],
      } as any,
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api'],
      timeout: 300,
      maxRetries: 3,
      organizationId: org1.id,
      tenantTools: {
        connect: [{ id: tenantToolCalc1.id }],
      },
      tags: {
        connect: [{ id: tagTest.id }, { id: tagMath.id }],
      },
    },
  });
  console.log(`✅ Workflow creado: ${workflow2.name}`);
  console.log(`   ID: ${workflow2.id}\n`);

  // ============================================
  // RESUMEN FINAL
  // ============================================
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════\n');

  console.log('📋 CREDENCIALES PARA TESTING:\n');
  
  console.log('👤 Organización 1: Acme Corp');
  console.log(`   Org ID: ${org1.id}`);
  console.log(`   Email: ${user1.email}`);
  console.log(`   Password: ${user1Password}`);
  console.log(`   API Key (Prod): ${apiKey1}`);
  console.log(`   API Key (Test): ${apiKey2}\n`);

  console.log('👤 Organización 2: TechStart Inc');
  console.log(`   Org ID: ${org2.id}`);
  console.log(`   Email: ${user2.email}`);
  console.log(`   Password: ${user2Password}`);
  console.log(`   API Key (Prod): ${apiKey3}\n`);

  console.log('🤖 WORKFLOWS PARA PRUEBAS:\n');
  console.log(`1. ${workflow1.name}`);
  console.log(`   ID: ${workflow1.id}`);
  console.log(`   Tools: Calculator (todas las funciones)`);
  console.log(`   Prueba: "¿Cuánto es 15% de 2350?"\n`);

  console.log(`2. ${workflow2.name}`);
  console.log(`   ID: ${workflow2.id}`);
  console.log(`   Tools: Calculator (solo percentage)`);
  console.log(`   Prueba: "Calcula el 20% de 500"\n`);

  console.log('🧪 EJEMPLO DE REQUEST PARA PROBAR:\n');
  console.log(`curl -X POST http://localhost:3000/api/workflows/${workflow1.id}/execute \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "x-api-key: ${apiKey1}" \\`);
  console.log(`  -d '{`);
  console.log(`    "input": {`);
  console.log(`      "message": "¿Cuánto es 15% de 2350?"`);
  console.log(`    },`);
  console.log(`    "metadata": {`);
  console.log(`      "channel": "api"`);
  console.log(`    }`);
  console.log(`  }'\n`);

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