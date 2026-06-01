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
  console.log('Starting mock data seeding version 2...');

  // 1. Find or create Organization
  let org = await prisma.organization.findFirst({
    where: { name: 'Fractal' },
  });

  const uniqueId = Math.random().toString(36).substring(7);

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Fractal',
        slug: 'fractal-' + uniqueId,
        plan: SubscriptionPlan.BUSINESS,
        allowOverages: true,
        overageLimit: 500,
        isActive: true,
      },
    });
    console.log('Created Organization: Fractal');
  }

  // 2. Create more users in the organization
  const userEmails = [
    'admin1@example.com',
    'manager1@example.com',
    'member1@example.com',
    'member2@example.com',
  ];
  const orgUsers = [];

  for (const email of userEmails) {
    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      u = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          password: '$2b$10$xyz', // Dummy password hash
          organizationId: org.id,
          role: email.startsWith('admin') ? 'ADMIN' : 'VIEWER',
        },
      });
    } else {
      await prisma.user.update({
        where: { id: u.id },
        data: { organizationId: org.id, role: email.startsWith('admin') ? 'ADMIN' : 'VIEWER' },
      });
    }
    orgUsers.push(u);
  }

  // 3. Subscription & Credit Balance
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

  let cb = await prisma.creditBalance.findUnique({ where: { organizationId: org.id } });
  if (!cb) {
    cb = await prisma.creditBalance.create({
      data: {
        organizationId: org.id,
        balance: 15000,
        lifetimeEarned: 25000,
        lifetimeSpent: 10000,
        currentMonthSpent: 1250,
        currentMonthCostUSD: 25.0,
      },
    });
  } else {
    // Add more credits
    await prisma.creditBalance.update({
      where: { id: cb.id },
      data: {
        balance: { increment: 5000 },
        lifetimeEarned: { increment: 5000 },
      },
    });
  }

  // Add credit transactions
  let currentBalance = cb?.balance || 0;
  await prisma.creditTransaction.createMany({
    data: Array.from({ length: 5 }).map((_, i) => {
      const amount = 1000;
      const balanceBefore = currentBalance;
      currentBalance += amount;
      return {
        organizationId: org.id,
        amount,
        balanceBefore: balanceBefore,
        balanceAfter: currentBalance,
        type: TransactionType.ONE_TIME_PURCHASE,
        description: 'Bulk credits purchase #' + i,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      };
    }),
  });

  // 4. Tools Catalogs
  const toolsData = [
    { toolName: 'google_calendar', displayName: 'Google Calendar', provider: 'google' },
    { toolName: 'hubspot_crm', displayName: 'HubSpot CRM', provider: 'hubspot' },
    { toolName: 'slack_notif', displayName: 'Slack Notifications', provider: 'slack' },
  ];

  const tenantTools = [];
  for (const td of toolsData) {
    // Ensure in catalog
    let catalogTool = await prisma.toolCatalog.findUnique({ where: { toolName: td.toolName } });
    if (!catalogTool) {
      catalogTool = await prisma.toolCatalog.create({
        data: {
          toolName: td.toolName,
          displayName: td.displayName,
          provider: td.provider,
          isActive: true,
        },
      });
    }

    // Ensure in tenant (organization)
    let tt = await prisma.tenantTool.findFirst({
      where: { organizationId: org.id, toolCatalogId: catalogTool.id },
    });
    if (!tt) {
      tt = await prisma.tenantTool.create({
        data: {
          organizationId: org.id,
          toolCatalogId: catalogTool.id,
          displayName: 'Prod ' + td.displayName,
          isConnected: true,
          status: ToolConnectionStatus.CONNECTED,
          createdByUserId: orgUsers[0].id,
        },
      });
    }
    tenantTools.push(tt);
  }

  // 5. Workflows
  console.log('Creating workflows...');
  const workflowData = [
    {
      name: 'Calendar Assistant',
      description: 'Books meetings seamlessly',
      category: WorkflowCategory.STANDARD,
      isActive: true,
      maxTokensPerExecution: 100000,
      tools: [tenantTools[0].id],
    },
    {
      name: 'CRM Synchronizer',
      description: 'Updates Deals via NLP',
      category: WorkflowCategory.ADVANCED,
      isActive: true,
      maxTokensPerExecution: 150000,
      tools: [tenantTools[1].id, tenantTools[2].id],
    },
  ];

  const workflows = [];
  for (const w of workflowData) {
    let wf = await prisma.workflow.findFirst({ where: { organizationId: org.id, name: w.name } });
    if (!wf) {
      wf = await prisma.workflow.create({
        data: {
          organizationId: org.id,
          name: w.name,
          description: w.description,
          category: w.category,
          isActive: w.isActive,
          maxTokensPerExecution: w.maxTokensPerExecution,
          config: { type: 'agent', graph: { type: 'react', config: {} } },
          tenantTools: {
            connect: w.tools.map((id) => ({ id })),
          },
        },
      });
    } else {
      // Connect existing tools
      await prisma.workflow.update({
        where: { id: wf.id },
        data: {
          tenantTools: {
            connect: w.tools.map((id) => ({ id })),
          },
        },
      });
    }
    workflows.push(wf);
  }

  // 6. Bulk Executions (in random dates across the last 30 days)
  console.log('Generating executions...');
  const executionsData = [];
  for (const wf of workflows) {
    // Gen 20 executions per workflow
    for (let i = 0; i < 20; i++) {
      // Random date in the last 30 days
      const daysAgo = Math.random() * 30;
      const startedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const finishedAt = new Date(startedAt.getTime() + Math.random() * 5000 + 1000); // 1-6 seconds later

      const isFailed = Math.random() < 0.15; // 15% failure rate

      executionsData.push({
        workflowId: wf.id,
        organizationId: org.id,
        status: isFailed ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED,
        trigger: TriggerType.MANUAL,
        startedAt,
        finishedAt,
        duration: Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
        tokensUsed: Math.floor(Math.random() * 2000) + 500,
        cost: Math.random() * 0.1,
        error: isFailed ? 'API connection unstable' : null,
      });
    }
  }

  await prisma.execution.createMany({
    data: executionsData,
  });

  console.log(`Created ${executionsData.length} executions with distributed dates.`);

  console.log('Mock data seeding version 2 completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
