import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODEL_EFFECTIVE_FROM = new Date('2026-01-01T00:00:00.000Z');

type LlmModelSeed = {
  provider: string;
  modelName: string;
  tier: 'BASIC' | 'STANDARD' | 'PREMIUM';
  category: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  contextWindow: number;
  recommendedMaxTokens: number;
};

type ToolFunctionSeed = {
  functionName: string;
  displayName: string;
  description: string;
  category: string;
  dangerLevel: 'SAFE' | 'WARNING' | 'DANGER';
};

type ToolCatalogSeed = {
  toolName: string;
  displayName: string;
  description: string;
  provider: string;
  category: string;
  icon: string;
  isActive: boolean;
  isInBeta: boolean;
  functions: ToolFunctionSeed[];
};

type NotificationSeed = {
  code: string;
  version: number;
  titleTemplate: string;
  messageTemplate: string;
  targetRoles: string[];
  isActive: boolean;
};

const llmModels: LlmModelSeed[] = [
  {
    provider: 'openai',
    modelName: 'gpt-4o-mini',
    tier: 'BASIC',
    category: 'chat',
    inputPricePer1m: 0.15,
    outputPricePer1m: 0.6,
    contextWindow: 128000,
    recommendedMaxTokens: 100000,
  },
  {
    provider: 'openai',
    modelName: 'gpt-4o',
    tier: 'STANDARD',
    category: 'chat',
    inputPricePer1m: 2.5,
    outputPricePer1m: 10.0,
    contextWindow: 128000,
    recommendedMaxTokens: 100000,
  },
  {
    provider: 'openai',
    modelName: 'gpt-4o-2024-11-20',
    tier: 'STANDARD',
    category: 'chat',
    inputPricePer1m: 2.5,
    outputPricePer1m: 10.0,
    contextWindow: 128000,
    recommendedMaxTokens: 100000,
  },
  {
    provider: 'openai',
    modelName: 'gpt-4-turbo',
    tier: 'PREMIUM',
    category: 'chat',
    inputPricePer1m: 10.0,
    outputPricePer1m: 30.0,
    contextWindow: 128000,
    recommendedMaxTokens: 100000,
  },
  {
    provider: 'openai',
    modelName: 'o1',
    tier: 'PREMIUM',
    category: 'reasoning',
    inputPricePer1m: 15.0,
    outputPricePer1m: 60.0,
    contextWindow: 200000,
    recommendedMaxTokens: 150000,
  },
  {
    provider: 'openai',
    modelName: 'o1-mini',
    tier: 'STANDARD',
    category: 'reasoning',
    inputPricePer1m: 3.0,
    outputPricePer1m: 12.0,
    contextWindow: 128000,
    recommendedMaxTokens: 100000,
  },
  {
    provider: 'anthropic',
    modelName: 'claude-3-haiku-20240307',
    tier: 'BASIC',
    category: 'chat',
    inputPricePer1m: 0.25,
    outputPricePer1m: 1.25,
    contextWindow: 200000,
    recommendedMaxTokens: 150000,
  },
  {
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    tier: 'STANDARD',
    category: 'chat',
    inputPricePer1m: 3.0,
    outputPricePer1m: 15.0,
    contextWindow: 200000,
    recommendedMaxTokens: 150000,
  },
  {
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    tier: 'PREMIUM',
    category: 'chat',
    inputPricePer1m: 15.0,
    outputPricePer1m: 75.0,
    contextWindow: 200000,
    recommendedMaxTokens: 150000,
  },
  {
    provider: 'google',
    modelName: 'gemini-1.5-flash',
    tier: 'BASIC',
    category: 'chat',
    inputPricePer1m: 0.075,
    outputPricePer1m: 0.3,
    contextWindow: 1000000,
    recommendedMaxTokens: 800000,
  },
  {
    provider: 'google',
    modelName: 'gemini-1.5-pro',
    tier: 'STANDARD',
    category: 'chat',
    inputPricePer1m: 1.25,
    outputPricePer1m: 5.0,
    contextWindow: 2000000,
    recommendedMaxTokens: 1500000,
  },
];

const toolCatalogs: ToolCatalogSeed[] = [
  {
    toolName: 'calculator',
    displayName: 'Calculator',
    description:
      'Herramienta de calculo matematico. Soporta operaciones basicas, porcentajes y conversiones de moneda.',
    provider: 'custom',
    category: 'utility',
    icon: 'https://api.iconify.design/mdi:calculator.svg',
    isActive: true,
    isInBeta: false,
    functions: [
      {
        functionName: 'calculator',
        displayName: 'Calcular expresion',
        description:
          'Evalua expresiones matematicas de forma segura. Soporta +, -, *, /, parentesis, decimales, modulo y potencias.',
        category: 'calculation',
        dangerLevel: 'SAFE',
      },
      {
        functionName: 'percentage',
        displayName: 'Calcular porcentaje',
        description: 'Calcula el porcentaje de un valor.',
        category: 'calculation',
        dangerLevel: 'SAFE',
      },
      {
        functionName: 'currency_convert',
        displayName: 'Convertir moneda',
        description: 'Convierte entre monedas (version mock para testing).',
        category: 'conversion',
        dangerLevel: 'SAFE',
      },
    ],
  },
  {
    toolName: 'google_calendar',
    displayName: 'Google Calendar',
    description: 'Gestion de agenda y eventos en Google Calendar.',
    provider: 'google',
    category: 'productivity',
    icon: 'https://api.iconify.design/mdi:google-calendar.svg',
    isActive: true,
    isInBeta: false,
    functions: [
      {
        functionName: 'check_calendar_availability',
        displayName: 'Verificar disponibilidad',
        description: 'Verifica si un horario esta disponible en el calendario.',
        category: 'read',
        dangerLevel: 'SAFE',
      },
      {
        functionName: 'create_calendar_event',
        displayName: 'Crear evento',
        description: 'Crea un nuevo evento en Google Calendar.',
        category: 'write',
        dangerLevel: 'SAFE',
      },
      {
        functionName: 'list_calendar_events',
        displayName: 'Listar eventos',
        description: 'Lista eventos en un rango de fechas.',
        category: 'read',
        dangerLevel: 'SAFE',
      },
      {
        functionName: 'update_calendar_event',
        displayName: 'Actualizar evento',
        description: 'Actualiza un evento existente en Google Calendar.',
        category: 'write',
        dangerLevel: 'WARNING',
      },
      {
        functionName: 'delete_calendar_event',
        displayName: 'Eliminar evento',
        description: 'Elimina un evento de Google Calendar.',
        category: 'delete',
        dangerLevel: 'DANGER',
      },
      {
        functionName: 'get_calendar_event_details',
        displayName: 'Obtener detalle de evento',
        description: 'Obtiene los detalles completos de un evento.',
        category: 'read',
        dangerLevel: 'SAFE',
      },
    ],
  },
];

const notifications: NotificationSeed[] = [
  {
    code: '0000-0001',
    version: 1,
    titleTemplate: 'Subscripcion',
    messageTemplate:
      'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicacion ya que formas parte fundamental de ella. Gracias por tu confianza.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0010',
    version: 1,
    titleTemplate: 'Invitacion De Email.',
    messageTemplate:
      'La invitacion para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitacion, te lo haremos saber a traves de una notificacion.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0011',
    version: 1,
    titleTemplate: 'Cancelacion De Invitacion.',
    messageTemplate:
      'La invitacion para %s ha sido reenviada exitosamente, por favor revisa tu correo electronico.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0100',
    version: 1,
    titleTemplate: 'Cancelacion De Subscripcion.',
    messageTemplate:
      'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0101',
    version: 1,
    titleTemplate: 'Cambio De Subscripcion.',
    messageTemplate:
      'La subscripcion %s ha sido cambiada (aun asi los beneficios de esta no seran cancelados hasta el inicio de la siguiente subscripcion). Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s a partir de %s al %s.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0110',
    version: 1,
    titleTemplate: 'Aviso De Creditos Bajos.',
    messageTemplate:
      'Tu organizacion tiene pocos creditos disponibles. Te quedan %s creditos.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0111',
    version: 1,
    titleTemplate: 'Reenvio De Invitacion.',
    messageTemplate:
      'La invitacion para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificacion.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0112',
    version: 1,
    titleTemplate: 'Sin Creditos Disponibles.',
    messageTemplate:
      'Tu organizacion se ha quedado sin creditos disponibles. Adquiere creditos o actualiza tu plan para continuar ejecutando workflows.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0113',
    version: 1,
    titleTemplate: 'Limite De Overage Alcanzado.',
    messageTemplate:
      'No se puede ejecutar el workflow porque se alcanzo el limite de overage (%s/%s).',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-0114',
    version: 1,
    titleTemplate: 'Intervencion Humana Requerida.',
    messageTemplate:
      'La conversacion %s del workflow %s requiere atencion humana. Motivo: %s.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
  {
    code: '0000-1000',
    version: 1,
    titleTemplate: 'Aceptacion De Invitacion.',
    messageTemplate:
      'La invitacion para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organizacion. Puedes gestionar su informacion desde el panel de administracion.',
    targetRoles: ['OWNER', 'ADMIN'],
    isActive: true,
  },
];

async function seedModels() {
  for (const model of llmModels) {
    await prisma.llmModel.upsert({
      where: {
        provider_modelName_effectiveFrom: {
          provider: model.provider,
          modelName: model.modelName,
          effectiveFrom: MODEL_EFFECTIVE_FROM,
        },
      },
      create: {
        ...model,
        effectiveFrom: MODEL_EFFECTIVE_FROM,
        isActive: true,
        currency: 'USD',
      },
      update: {
        tier: model.tier,
        category: model.category,
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
          category: fn.category,
          dangerLevel: fn.dangerLevel,
          isActive: true,
          isInBeta: false,
        },
        update: {
          displayName: fn.displayName,
          description: fn.description,
          category: fn.category,
          dangerLevel: fn.dangerLevel,
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
  });
