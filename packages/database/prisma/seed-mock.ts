import {
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  TransactionType,
  InvoiceType,
  InvoiceStatus,
  WorkflowCategory,
  TriggerType,
  ExecutionStatus,
  ConversationStatus,
  ChatRole,
  ToolConnectionStatus,
} from '@prisma/client';
import { prisma } from '../src/index';

async function main() {
  console.log('Starting mock data seeding...');

  // 1. Get or create the User
  const email = 'cervantesdaniellimon50m@gmail.com';
  let user = await prisma.user.findUnique({ where: { email } });

  // 2. Find or create Organization
  let org = await prisma.organization.findFirst({
    where: { name: 'Fractal' },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Fractal',
        slug: 'fractal-' + Math.random().toString(36).substring(7),
        plan: SubscriptionPlan.BUSINESS,
        allowOverages: true,
        overageLimit: 500,
        isActive: true,
      },
    });
    console.log('Created Organization: Fractal');
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { plan: SubscriptionPlan.BUSINESS },
    });
    console.log('Updated Organization to BUSINESS: Fractal');
  }

  // Assign user to org
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id, role: 'OWNER' },
    });
  } else {
    // We shouldn't create it with dummy password unless required. The user mentioned they tried to sign up.
    // They might already exist.
  }

  // 3. Subscription
  let sub = await prisma.subscription.findUnique({ where: { organizationId: org.id } });
  if (!sub) {
    const endPeriod = new Date();
    endPeriod.setMonth(endPeriod.getMonth() + 1);
    sub = await prisma.subscription.create({
      data: {
        organizationId: org.id,
        plan: SubscriptionPlan.BUSINESS,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: endPeriod,
      },
    });
  }

  // 4. Credit Balance
  let cb = await prisma.creditBalance.findUnique({ where: { organizationId: org.id } });
  if (!cb) {
    cb = await prisma.creditBalance.create({
      data: {
        organizationId: org.id,
        balance: 1500,
        lifetimeEarned: 5000,
        lifetimeSpent: 3500,
        currentMonthSpent: 250,
        currentMonthCostUSD: 5.25,
      },
    });
  }

  // 5. Invoices
  let uniqueId = Math.random().toString(36).substring(7);
  await prisma.invoice.createMany({
    data: [
      {
        organizationId: org.id,
        subscriptionId: sub.id,
        subtotal: 99.0,
        tax: 0,
        overageAmount: 0,
        total: 99.0,
        invoiceNumber: 'INV-' + uniqueId + '-1',
        type: InvoiceType.SUBSCRIPTION,
        status: InvoiceStatus.PAID,
        stripeInvoiceId: 'in_' + uniqueId + '1',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        organizationId: org.id,
        subscriptionId: sub.id,
        subtotal: 99.0,
        tax: 0,
        overageAmount: 0,
        total: 99.0,
        invoiceNumber: 'INV-' + uniqueId + '-2',
        type: InvoiceType.SUBSCRIPTION,
        status: InvoiceStatus.PENDING,
        stripeInvoiceId: 'in_' + uniqueId + '2',
      },
    ],
    skipDuplicates: true,
  });

  // 6. Tools Catalog & Tenant Tools
  const tc = await prisma.toolCatalog.findFirst();
  let tenantToolId = undefined;
  if (tc) {
    const tt = await prisma.tenantTool.create({
      data: {
        organizationId: org.id,
        toolCatalogId: tc.id,
        displayName: 'Connection to ' + tc.displayName,
        isConnected: true,
        status: ToolConnectionStatus.CONNECTED,
        createdByUserId: user?.id,
      },
    });
    tenantToolId = tt.id;
  }

  // 7. Workflows
  console.log('Creating workflows...');
  const workflowData = [
    {
      name: 'Customer Support Agent',
      description: 'Handles L1 support queries automatically.',
      category: WorkflowCategory.STANDARD,
      isActive: true,
      maxExecutionsPerMonth: 1000,
      maxTokensPerExecution: 100000,
    },
    {
      name: 'Lead Qualifier',
      description: 'Qualifies leads via WhatsApp',
      category: WorkflowCategory.LIGHT,
      isActive: true,
      maxExecutionsPerMonth: 1000,
      maxTokensPerExecution: 100000,
    },
    {
      name: 'Data Processor',
      description: 'Background job to process CSV files',
      category: WorkflowCategory.ADVANCED,
      isActive: false,
      maxExecutionsPerMonth: 1000,
      maxTokensPerExecution: 100000,
    },
  ];

  const workflows = [];
  for (const w of workflowData) {
    const existing = await prisma.workflow.findFirst({
      where: { organizationId: org.id, name: w.name },
    });
    if (!existing) {
      const wf = await prisma.workflow.create({
        data: {
          organizationId: org.id,
          name: w.name,
          description: w.description,
          category: w.category,
          isActive: w.isActive,
          maxTokensPerExecution: w.maxTokensPerExecution,
          config: { type: 'agent', graph: { type: 'react', config: {} } },
        },
      });
      workflows.push(wf);
    } else {
      workflows.push(existing);
    }
  }

  // 8. End Users
  console.log('Creating end users...');
  const endUsers = [];
  for (let i = 1; i <= 5; i++) {
    const existing = await prisma.endUser.findFirst({
      where: { organizationId: org.id, email: `customer${i}@example.com` },
    });
    if (!existing) {
      const eu = await prisma.endUser.create({
        data: {
          organizationId: org.id,
          externalId: 'ext_' + i + '_' + uniqueId,
          name: 'Customer ' + i,
          email: `customer${i}@example.com`,
        },
      });
      endUsers.push(eu);
    } else {
      endUsers.push(existing);
    }
  }

  // 9. Conversations & Messages & Executions
  console.log('Creating conversations and executions...');
  for (const wf of workflows) {
    for (let i = 0; i < 3; i++) {
      const isFailed = i === 2;
      const endUser = endUsers[i % endUsers.length];

      // Executions
      await prisma.execution.create({
        data: {
          workflowId: wf.id,
          organizationId: org.id,
          status: isFailed ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED,
          trigger: TriggerType.MANUAL,
          startedAt: new Date(Date.now() - Math.random() * 10000000),
          finishedAt: new Date(),
          duration: Math.floor(Math.random() * 5000),
          tokensUsed: Math.floor(Math.random() * 5000),
          cost: 0.05,
          error: isFailed ? 'Timeout reaching API' : null,
        },
      });

      // Conversation
      const conv = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          workflowId: wf.id,
          endUserId: endUser.id,
          status: i === 0 ? ConversationStatus.ACTIVE : ConversationStatus.CLOSED,
          channel: 'WEB',
          metadata: {},
        },
      });

      // Messages in conversation
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          organizationId: org.id,
          role: ChatRole.USER,
          content: 'Hello, I need help with my account.',
        },
      });

      await prisma.message.create({
        data: {
          conversationId: conv.id,
          organizationId: org.id,
          role: ChatRole.ASSISTANT,
          content: 'Sure, please provide your account ID.',
          model: 'gpt-4o',
          tokens: 50,
          cost: 0.001,
        },
      });
    }
  }

  console.log('Mock data seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
