import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...\n');

  // Limpiar datos existentes (opcional)
  console.log('🧹 Limpiando datos existentes...');
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.creditBalance.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.modelPrice.deleteMany();
  await prisma.tenantTool.deleteMany();
  await prisma.toolFunction.deleteMany();
  await prisma.toolCatalog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.whatsAppConfig.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.endUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('✅ Datos limpiados\n');

  // ============================================
  // CREAR MODEL PRICES (PRECIOS DE MODELOS)
  // ============================================
  console.log('💰 Creando precios de modelos...');

  // OpenAI Models
  await prisma.modelPrice.createMany({
    data: [
      // BASIC TIER - Solo para workflows LIGHT
      {
        provider: 'openai',
        modelName: 'gpt-4o-mini',
        tier: 'BASIC',
        category: 'chat',
        inputPricePer1m: 0.15,
        outputPricePer1m: 0.60,
        contextWindow: 128000,
        recommendedMaxTokens: 100000,
        isActive: true,
      },
      // STANDARD TIER - Para LIGHT y STANDARD workflows
      {
        provider: 'openai',
        modelName: 'gpt-4o',
        tier: 'STANDARD',
        category: 'chat',
        inputPricePer1m: 2.50,
        outputPricePer1m: 10.00,
        contextWindow: 128000,
        recommendedMaxTokens: 100000,
        isActive: true,
      },
      {
        provider: 'openai',
        modelName: 'gpt-4o-2024-11-20',
        tier: 'STANDARD',
        category: 'chat',
        inputPricePer1m: 2.50,
        outputPricePer1m: 10.00,
        contextWindow: 128000,
        recommendedMaxTokens: 100000,
        isActive: true,
      },
      // PREMIUM TIER - Para todos los workflows
      {
        provider: 'openai',
        modelName: 'gpt-4-turbo',
        tier: 'PREMIUM',
        category: 'chat',
        inputPricePer1m: 10.00,
        outputPricePer1m: 30.00,
        contextWindow: 128000,
        recommendedMaxTokens: 100000,
        isActive: true,
      },
      {
        provider: 'openai',
        modelName: 'o1',
        tier: 'PREMIUM',
        category: 'reasoning',
        inputPricePer1m: 15.00,
        outputPricePer1m: 60.00,
        contextWindow: 200000,
        recommendedMaxTokens: 150000,
        isActive: true,
      },
      {
        provider: 'openai',
        modelName: 'o1-mini',
        tier: 'STANDARD',
        category: 'reasoning',
        inputPricePer1m: 3.00,
        outputPricePer1m: 12.00,
        contextWindow: 128000,
        recommendedMaxTokens: 100000,
        isActive: true,
      },

      // Anthropic Claude Models
      {
        provider: 'anthropic',
        modelName: 'claude-3-haiku-20240307',
        tier: 'BASIC',
        category: 'chat',
        inputPricePer1m: 0.25,
        outputPricePer1m: 1.25,
        contextWindow: 200000,
        recommendedMaxTokens: 150000,
        isActive: true,
      },
      {
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        tier: 'STANDARD',
        category: 'chat',
        inputPricePer1m: 3.00,
        outputPricePer1m: 15.00,
        contextWindow: 200000,
        recommendedMaxTokens: 150000,
        isActive: true,
      },
      {
        provider: 'anthropic',
        modelName: 'claude-3-opus-20240229',
        tier: 'PREMIUM',
        category: 'chat',
        inputPricePer1m: 15.00,
        outputPricePer1m: 75.00,
        contextWindow: 200000,
        recommendedMaxTokens: 150000,
        isActive: true,
      },

      // Google Models
      {
        provider: 'google',
        modelName: 'gemini-1.5-flash',
        tier: 'BASIC',
        category: 'chat',
        inputPricePer1m: 0.075,
        outputPricePer1m: 0.30,
        contextWindow: 1000000,
        recommendedMaxTokens: 800000,
        isActive: true,
      },
      {
        provider: 'google',
        modelName: 'gemini-1.5-pro',
        tier: 'STANDARD',
        category: 'chat',
        inputPricePer1m: 1.25,
        outputPricePer1m: 5.00,
        contextWindow: 2000000,
        recommendedMaxTokens: 1500000,
        isActive: true,
      },
    ],
  });
  console.log('✅ Precios de modelos creados\n');

  // ============================================
  // CREAR ORGANIZACIONES CON SISTEMA DE CRÉDITOS
  // ============================================
  console.log('🏢 Creando organizaciones...');

  // Organización 1: Plan STARTER
  const org1 = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'STARTER',
      isActive: true,
      region: 'us-central',
      allowOverages: true,
      overageLimit: 150,
    },
  });

  // Crear CreditBalance para org1
  const balance1 = await prisma.creditBalance.create({
    data: {
      organizationId: org1.id,
      balance: 150, // Créditos iniciales del plan STARTER
      lifetimeEarned: 150,
      lifetimeSpent: 0,
      currentMonthSpent: 0,
      currentMonthCostUSD: 0,
    },
  });

  // Crear Subscription para org1
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // +1 mes

  const subscription1 = await prisma.subscription.create({
    data: {
      organizationId: org1.id,
      plan: 'STARTER',
      status: 'ACTIVE',
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      cancelAtPeriodEnd: false,
    },
  });

  // Crear transacción de renovación inicial
  await prisma.creditTransaction.create({
    data: {
      organizationId: org1.id,
      type: 'SUBSCRIPTION_RENEWAL',
      amount: 150,
      balanceBefore: 0,
      balanceAfter: 150,
      subscriptionId: subscription1.id,
      description: 'Renovación plan STARTER - Mes inicial',
    },
  });

  console.log(`✅ Organización creada: ${org1.name} (STARTER - 150 créditos)\n`);

  // Organización 2: Plan GROWTH
  const org2 = await prisma.organization.create({
    data: {
      name: 'TechStart Inc',
      slug: 'techstart-inc',
      plan: 'GROWTH',
      isActive: true,
      region: 'us-east',
      allowOverages: true,
      overageLimit: 500,
    },
  });

  const balance2 = await prisma.creditBalance.create({
    data: {
      organizationId: org2.id,
      balance: 500,
      lifetimeEarned: 500,
      lifetimeSpent: 0,
      currentMonthSpent: 0,
      currentMonthCostUSD: 0,
    },
  });

  const subscription2 = await prisma.subscription.create({
    data: {
      organizationId: org2.id,
      plan: 'GROWTH',
      status: 'ACTIVE',
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org2.id,
      type: 'SUBSCRIPTION_RENEWAL',
      amount: 500,
      balanceBefore: 0,
      balanceAfter: 500,
      subscriptionId: subscription2.id,
      description: 'Renovación plan GROWTH - Mes inicial',
    },
  });

  console.log(`✅ Organización creada: ${org2.name} (GROWTH - 500 créditos)\n`);

  // Organización 3: Plan PRO
  const org3 = await prisma.organization.create({
    data: {
      name: 'Enterprise Solutions LLC',
      slug: 'enterprise-solutions',
      plan: 'PRO',
      isActive: true,
      region: 'eu-west',
      allowOverages: true,
      overageLimit: 5000,
    },
  });

  const balance3 = await prisma.creditBalance.create({
    data: {
      organizationId: org3.id,
      balance: 5000,
      lifetimeEarned: 5000,
      lifetimeSpent: 0,
      currentMonthSpent: 0,
      currentMonthCostUSD: 0,
    },
  });

  const subscription3 = await prisma.subscription.create({
    data: {
      organizationId: org3.id,
      plan: 'PRO',
      status: 'ACTIVE',
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org3.id,
      type: 'SUBSCRIPTION_RENEWAL',
      amount: 5000,
      balanceBefore: 0,
      balanceAfter: 5000,
      subscriptionId: subscription3.id,
      description: 'Renovación plan PRO - Mes inicial',
    },
  });

  console.log(`✅ Organización creada: ${org3.name} (PRO - 5000 créditos)\n`);

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

  const user3Password = 'Enterprise2026!';
  const user3 = await prisma.user.create({
    data: {
      email: 'admin@enterprise-solutions.com',
      password: await bcrypt.hash(user3Password, 10),
      name: 'Admin Enterprise',
      emailVerified: true,
      role: 'admin',
      isActive: true,
      organizationId: org3.id,
    },
  });
  console.log(`✅ Usuario creado: ${user3.name} (${user3.email})`);
  console.log(`   Password: ${user3Password}\n`);

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
  // ASIGNAR TOOLS A ORGANIZACIONES
  // ============================================
  console.log('🔗 Asignando tools a organizaciones...');

  const tenantToolCalc1 = await prisma.tenantTool.create({
    data: {
      organizationId: org1.id,
      toolCatalogId: toolCalculator.id,
      displayName: 'Calculator - Acme',
      isConnected: true,
    },
  });

  const tenantToolCalc2 = await prisma.tenantTool.create({
    data: {
      organizationId: org2.id,
      toolCatalogId: toolCalculator.id,
      displayName: 'Calculator - TechStart',
      isConnected: true,
    },
  });

  console.log(`✅ Tools asignadas\n`);

  // ============================================
  // CREAR TAGS
  // ============================================
  console.log('🏷️  Creando tags...');

  const tagMath = await prisma.tag.create({
    data: { name: 'math', color: '#3B82F6' },
  });

  const tagDemo = await prisma.tag.create({
    data: { name: 'demo', color: '#10B981' },
  });

  const tagTest = await prisma.tag.create({
    data: { name: 'test', color: '#F59E0B' },
  });

  console.log(`✅ Tags creadas\n`);

  // ============================================
  // CREAR WORKFLOWS CON CATEGORÍAS (LIGHT/STANDARD/ADVANCED)
  // ============================================
  console.log('🤖 Creando workflows...');

  // Workflow 1: LIGHT (1 crédito) - Acme Corp
  const workflow1 = await prisma.workflow.create({
    data: {
      name: 'Calculadora Rápida',
      description: 'Workflow ligero para cálculos simples',
      category: 'LIGHT',
      maxTokensPerExecution: 20000,
      config: {
        graph: {
          type: 'react',
          config: {
            max_iterations: 3,
            allow_interrupts: false,
          },
        },
        agents: {
          default: {
            model: 'gpt-4o-mini',
            temperature: 0.3,
            system_prompt: 'Eres un asistente de cálculo rápido. Responde de forma concisa.',
            // Control granular: solo permite calculator y percentage, NO currency_convert
            tools: [
              {
                id: tenantToolCalc1.id,
                functions: ['calculator', 'percentage'],
              },
            ],
          },
        },
      },
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api', 'manual'],
      timeout: 60,
      maxRetries: 2,
      organizationId: org1.id,
      tenantTools: {
        connect: [{ id: tenantToolCalc1.id }],
      },
      tags: {
        connect: [{ id: tagMath.id }, { id: tagDemo.id }],
      },
    },
  });
  console.log(`✅ Workflow LIGHT creado: ${workflow1.name}`);
  console.log(`   Permisos: Solo calculator y percentage`);

  // Workflow 2: STANDARD (5 créditos) - Acme Corp
  const workflow2 = await prisma.workflow.create({
    data: {
      name: 'Asistente Financiero',
      description: 'Workflow estándar para análisis financiero',
      category: 'STANDARD',
      maxTokensPerExecution: 50000,
      maxMessages: 20,
      config: {
        graph: {
          type: 'react',
          config: {
            max_iterations: 10,
            allow_interrupts: true,
          },
        },
        agents: {
          default: {
            model: 'gpt-4o',
            temperature: 0.5,
            system_prompt: 'Eres un asistente financiero experto. Proporciona análisis detallados con cálculos precisos.',
            // Sin restricciones = puede usar TODAS las funciones disponibles (string format)
            tools: [tenantToolCalc1.id],
          },
        },
      },
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api', 'manual'],
      timeout: 180,
      maxRetries: 3,
      organizationId: org1.id,
      tenantTools: {
        connect: [{ id: tenantToolCalc1.id }],
      },
      tags: {
        connect: [{ id: tagMath.id }, { id: tagDemo.id }],
      },
    },
  });
  console.log(`✅ Workflow STANDARD creado: ${workflow2.name}`);
  console.log(`   Permisos: Todas las funciones (sin restricciones)`);

  // Workflow 3: ADVANCED (25 créditos) - TechStart
  const workflow3 = await prisma.workflow.create({
    data: {
      name: 'Análisis Estratégico Multi-Agente',
      description: 'Workflow avanzado para análisis complejos con múltiples iteraciones',
      category: 'ADVANCED',
      maxTokensPerExecution: 128000,
      maxMessages: 50,
      inactivityHours: 48,
      config: {
        graph: {
          type: 'react',
          config: {
            max_iterations: 50,
            allow_interrupts: true,
          },
        },
        agents: {
          default: {
            model: 'gpt-4o',
            temperature: 0.7,
            system_prompt: 'Eres un agente estratégico de alto nivel. Realiza análisis profundos y detallados con razonamiento paso a paso.',
            // Control granular: solo permite calculator básica
            tools: [
              {
                id: tenantToolCalc2.id,
                functions: ['calculator'],
              },
            ],
          },
        },
      },
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api', 'manual'],
      timeout: 600,
      maxRetries: 3,
      organizationId: org2.id,
      tenantTools: {
        connect: [{ id: tenantToolCalc2.id }],
      },
      tags: {
        connect: [{ id: tagMath.id }, { id: tagDemo.id }],
      },
    },
  });
  console.log(`✅ Workflow ADVANCED creado: ${workflow3.name}`);
  console.log(`   Permisos: Solo calculator (sin percentage ni currency_convert)`);

  // Workflow 4: LIGHT para testing - TechStart
  const workflow4 = await prisma.workflow.create({
    data: {
      name: 'Test Bot Simple',
      description: 'Bot de testing simple',
      category: 'LIGHT',
      maxTokensPerExecution: 20000,
      config: {
        graph: {
          type: 'react',
          config: {
            max_iterations: 3,
            allow_interrupts: false,
          },
        },
        agents: {
          default: {
            model: 'gpt-4o-mini',
            temperature: 0.2,
            system_prompt: 'Eres un bot de prueba. Responde de forma breve.',
            // Sin tools asignadas
            tools: [],
          },
        },
      },
      version: 1,
      isActive: true,
      isPaused: false,
      triggerType: ['api'],
      timeout: 60,
      maxRetries: 1,
      organizationId: org2.id,
      tags: {
        connect: [{ id: tagTest.id }],
      },
    },
  });
  console.log(`✅ Workflow LIGHT creado: ${workflow4.name}\n`);

  // ============================================
  // CREAR EJECUCIONES DE EJEMPLO CON CRÉDITOS
  // ============================================
  console.log('⚙️  Creando ejecuciones de ejemplo...');

  // Ejecución 1: LIGHT exitosa (1 crédito)
  const execution1 = await prisma.execution.create({
    data: {
      workflowId: workflow1.id,
      organizationId: org1.id,
      userId: user1.id,
      status: 'completed',
      trigger: 'manual',
      startedAt: new Date(Date.now() - 3600000), // Hace 1 hora
      finishedAt: new Date(Date.now() - 3500000),
      duration: 60,
      cost: 0.008, // $0.008 USD costo real
      credits: 1, // 1 crédito cobrado
      tokensUsed: 1250,
      balanceBefore: 150,
      balanceAfter: 149,
      wasOverage: false,
      result: {
        output: 'El 15% de 2350 es 352.5',
        tokens: { input: 850, output: 400 },
      },
    },
  });

  // Actualizar balance de org1
  await prisma.creditBalance.update({
    where: { organizationId: org1.id },
    data: {
      balance: 149,
      lifetimeSpent: 1,
      currentMonthSpent: 1,
      currentMonthCostUSD: 0.008,
    },
  });

  // Crear transacción de crédito
  await prisma.creditTransaction.create({
    data: {
      organizationId: org1.id,
      type: 'EXECUTION_DEDUCTION',
      amount: -1,
      balanceBefore: 150,
      balanceAfter: 149,
      executionId: execution1.id,
      workflowCategory: 'LIGHT',
      costUSD: 0.008,
      description: `Ejecución workflow: ${workflow1.name}`,
      metadata: {
        tokens: 1250,
        model: 'gpt-4o-mini',
        duration: 60,
      },
    },
  });

  console.log(`✅ Ejecución LIGHT creada (1 crédito gastado)`);

  // Ejecución 2: STANDARD exitosa (5 créditos)
  const execution2 = await prisma.execution.create({
    data: {
      workflowId: workflow2.id,
      organizationId: org1.id,
      userId: user1.id,
      status: 'completed',
      trigger: 'api',
      startedAt: new Date(Date.now() - 1800000), // Hace 30 min
      finishedAt: new Date(Date.now() - 1680000),
      duration: 120,
      cost: 0.045, // $0.045 USD costo real
      credits: 5, // 5 créditos cobrados
      tokensUsed: 8500,
      balanceBefore: 149,
      balanceAfter: 144,
      wasOverage: false,
      result: {
        output: 'Análisis financiero completo con proyecciones...',
        tokens: { input: 5000, output: 3500 },
      },
    },
  });

  await prisma.creditBalance.update({
    where: { organizationId: org1.id },
    data: {
      balance: 144,
      lifetimeSpent: 6,
      currentMonthSpent: 6,
      currentMonthCostUSD: 0.053,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org1.id,
      type: 'EXECUTION_DEDUCTION',
      amount: -5,
      balanceBefore: 149,
      balanceAfter: 144,
      executionId: execution2.id,
      workflowCategory: 'STANDARD',
      costUSD: 0.045,
      description: `Ejecución workflow: ${workflow2.name}`,
      metadata: {
        tokens: 8500,
        model: 'gpt-4o',
        duration: 120,
      },
    },
  });

  console.log(`✅ Ejecución STANDARD creada (5 créditos gastados)`);

  // Ejecución 3: ADVANCED exitosa (25 créditos) - TechStart
  const execution3 = await prisma.execution.create({
    data: {
      workflowId: workflow3.id,
      organizationId: org2.id,
      userId: user2.id,
      status: 'completed',
      trigger: 'manual',
      startedAt: new Date(Date.now() - 7200000), // Hace 2 horas
      finishedAt: new Date(Date.now() - 6600000),
      duration: 600,
      cost: 0.285, // $0.285 USD costo real
      credits: 25, // 25 créditos cobrados
      tokensUsed: 45000,
      balanceBefore: 500,
      balanceAfter: 475,
      wasOverage: false,
      result: {
        output: 'Análisis estratégico multi-agente completado con 12 iteraciones...',
        tokens: { input: 28000, output: 17000 },
      },
    },
  });

  await prisma.creditBalance.update({
    where: { organizationId: org2.id },
    data: {
      balance: 475,
      lifetimeSpent: 25,
      currentMonthSpent: 25,
      currentMonthCostUSD: 0.285,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org2.id,
      type: 'EXECUTION_DEDUCTION',
      amount: -25,
      balanceBefore: 500,
      balanceAfter: 475,
      executionId: execution3.id,
      workflowCategory: 'ADVANCED',
      costUSD: 0.285,
      description: `Ejecución workflow: ${workflow3.name}`,
      metadata: {
        tokens: 45000,
        model: 'gpt-4o',
        duration: 600,
        iterations: 12,
      },
    },
  });

  console.log(`✅ Ejecución ADVANCED creada (25 créditos gastados)\n`);

  // ============================================
  // RESUMEN FINAL
  // ============================================
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════\n');

  console.log('📋 CREDENCIALES PARA TESTING:\n');
  
  console.log('👤 Organización 1: Acme Corp (STARTER)');
  console.log(`   Org ID: ${org1.id}`);
  console.log(`   Email: ${user1.email}`);
  console.log(`   Password: ${user1Password}`);
  console.log(`   Balance: 144 créditos (gastó 6 de 150)\n`);

  console.log('👤 Organización 2: TechStart Inc (GROWTH)');
  console.log(`   Org ID: ${org2.id}`);
  console.log(`   Email: ${user2.email}`);
  console.log(`   Password: ${user2Password}`);
  console.log(`   Balance: 475 créditos (gastó 25 de 500)\n`);

  console.log('👤 Organización 3: Enterprise Solutions (PRO)');
  console.log(`   Org ID: ${org3.id}`);
  console.log(`   Email: ${user3.email}`);
  console.log(`   Password: ${user3Password}`);
  console.log(`   Balance: 5000 créditos (sin usar)\n`);

  console.log('🤖 WORKFLOWS CREADOS:\n');
  console.log(`1. ${workflow1.name} (LIGHT - 1 crédito)`);
  console.log(`   ID: ${workflow1.id}`);
  console.log(`   Org: Acme Corp\n`);

  console.log(`2. ${workflow2.name} (STANDARD - 5 créditos)`);
  console.log(`   ID: ${workflow2.id}`);
  console.log(`   Org: Acme Corp\n`);

  console.log(`3. ${workflow3.name} (ADVANCED - 25 créditos)`);
  console.log(`   ID: ${workflow3.id}`);
  console.log(`   Org: TechStart Inc\n`);

  console.log(`4. ${workflow4.name} (LIGHT - 1 crédito)`);
  console.log(`   ID: ${workflow4.id}`);
  console.log(`   Org: TechStart Inc\n`);

  console.log('💰 PRECIOS DE MODELOS CONFIGURADOS:');
  console.log('   - BASIC: gpt-4o-mini, claude-haiku, gemini-flash');
  console.log('   - STANDARD: gpt-4o, claude-sonnet, gemini-pro, o1-mini');
  console.log('   - PREMIUM: gpt-4-turbo, claude-opus, o1\n');

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