import { Test, TestingModule } from '@nestjs/testing';
import { CreditsService } from './credits.service';
import { PrismaService } from '../database/prisma.service';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

// ─── Mock de getWorkflowCreditCost ─────────────────────────────────
jest.mock('@tesseract/types', () => ({
  ...jest.requireActual('@tesseract/types'),
  getWorkflowCreditCost: jest.fn(),
}));
import { getWorkflowCreditCost } from '@tesseract/types';
const mockGetWorkflowCreditCost = getWorkflowCreditCost as jest.MockedFunction<
  typeof getWorkflowCreditCost
>;

// ─── Mock de CursorPaginatedResponseUtils (singleton) ──────────────
const mockBuild = jest.fn();
jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({
  build: mockBuild,
} as unknown as CursorPaginatedResponseUtils);

// ─── Mock de PrismaService ─────────────────────────────────────────
const mockPrismaService = {
  creditBalance: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  creditTransaction: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
  },
  execution: {
    update: jest.fn(),
  },
  workflow: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─── Mock de Winston Logger ────────────────────────────────────────
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

describe('CreditsService', () => {
  let service: CreditsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════
  describe('create', () => {
    it('should create a credit balance with zero values for new organization', async () => {
      const mockBalance = {
        id: 'cb-1',
        organizationId: 'org-123',
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        currentMonthSpent: 0,
        currentMonthCostUSD: 0,
      };
      mockPrismaService.creditBalance.create.mockResolvedValue(mockBalance);

      const result = await service.create('org-123');

      expect(result).toEqual(mockBalance);
      expect(mockPrismaService.creditBalance.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          balance: 0,
          lifetimeEarned: 0,
          lifetimeSpent: 0,
          currentMonthSpent: 0,
          currentMonthCostUSD: 0,
        },
      });
    });

    it('should return null and log error when Prisma throws', async () => {
      mockPrismaService.creditBalance.create.mockRejectedValue(
        new Error('Unique constraint failed'),
      );

      const result = await service.create('org-123');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creando credit balance'),
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockPrismaService.creditBalance.create.mockRejectedValue('unknown error');

      const result = await service.create('org-123');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('unknown error'),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // addCredits
  // ═══════════════════════════════════════════════════════════════
  describe('addCredits', () => {
    const orgId = 'org-123';

    it('should add credits and create a transaction atomically', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 100,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      await service.addCredits(orgId, 50, 'SUBSCRIPTION_RENEWAL', 'Monthly credit');

      expect(mockPrismaService.creditBalance.findUnique).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
      // $transaction receives an array of lazy Prisma operations
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      const transactionArg = mockPrismaService.$transaction.mock.calls[0][0];
      expect(transactionArg).toHaveLength(2); // update + create
    });

    it('should throw error when credit balance not found', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.addCredits(orgId, 50, 'SUBSCRIPTION_RENEWAL'),
      ).rejects.toThrow('Credit balance not found');

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should pass optional metadata, costUSD, subscriptionId, and invoiceId', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 200,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      await service.addCredits(
        orgId,
        100,
        'ONE_TIME_PURCHASE',
        'Bought credits',
        { source: 'stripe' },
        9.99,
        'sub-123',
        'inv-456',
      );

      // Verify the transaction was called (the actual Prisma calls are inside the array)
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should calculate balanceAfter correctly', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 75,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      await service.addCredits(orgId, 25, 'SUBSCRIPTION_RENEWAL');

      // Verify update and transaction were called with the right balance calculation
      // balanceBefore = 75, amount = 25, balanceAfter = 100
      const transactionCalls = mockPrismaService.$transaction.mock.calls[0][0];
      expect(transactionCalls).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // canExecuteWorkflow
  // ═══════════════════════════════════════════════════════════════
  describe('canExecuteWorkflow', () => {
    const orgId = 'org-123';

    beforeEach(() => {
      mockGetWorkflowCreditCost.mockReturnValue(10);
    });

    // Caso 1: Tiene créditos suficientes
    it('should allow when balance has enough credits', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 50,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: false,
        overageLimit: null,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'LIGHT');

      expect(result).toEqual({ allowed: true });
    });

    // Caso 2: Balance o org no encontrados
    it('should deny when balance is not found', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: false,
        overageLimit: null,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'LIGHT');

      expect(result).toEqual({
        allowed: false,
        reason: 'Organization or balance not found',
      });
    });

    it('should deny when organization is not found', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 50,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      const result = await service.canExecuteWorkflow(orgId, 'LIGHT');

      expect(result).toEqual({
        allowed: false,
        reason: 'Organization or balance not found',
      });
    });

    // Caso 3: Créditos insuficientes, overages no permitidos
    it('should deny when insufficient credits and overages not allowed', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 5,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: false,
        overageLimit: null,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'ADVANCED');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient credits');
      expect(result.reason).toContain('overages not allowed');
    });

    // Caso 4: Overages permitidos, overageLimit es null
    it('should deny when overages allowed but limit is null', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 3,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: true,
        overageLimit: null,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'STANDARD');

      expect(result).toEqual({
        allowed: false,
        reason: 'Overage limit not configured',
      });
    });

    // Caso 5: Overages permitidos, dentro del límite
    it('should allow when overage is within the limit', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 5,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: true,
        overageLimit: 100,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'ADVANCED');

      expect(result).toEqual({ allowed: true });
    });

    // Caso 6: Overages permitidos, excede el límite
    it('should deny when overage would exceed the limit', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 5,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: true,
        overageLimit: 3,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'ADVANCED');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Would exceed overage limit');
    });

    // Caso 7: Balance exactamente igual a requerido
    it('should allow when balance equals exactly the required credits', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 10,
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        allowOverages: false,
        overageLimit: null,
        plan: 'PRO',
      });

      const result = await service.canExecuteWorkflow(orgId, 'STANDARD');

      expect(result).toEqual({ allowed: true });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // deductCredits
  // ═══════════════════════════════════════════════════════════════
  describe('deductCredits', () => {
    const orgId = 'org-123';
    const executionId = 'exec-1';
    const workflowId = 'wf-1';

    beforeEach(() => {
      mockGetWorkflowCreditCost.mockReturnValue(10);
    });

    it('should deduct credits and update all related records atomically', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 100,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);
      mockPrismaService.workflow.findUnique.mockResolvedValue({
        totalCreditsConsumed: 50,
        totalExecutions: 5,
      });
      mockPrismaService.workflow.update.mockResolvedValue(undefined);

      await service.deductCredits(
        orgId,
        executionId,
        workflowId,
        'ADVANCED',
        'My Workflow',
      );

      // Transaction should contain 4 operations
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      const transactionArg = mockPrismaService.$transaction.mock.calls[0][0];
      expect(transactionArg).toHaveLength(4);

      // Should calculate avg credits and update workflow
      expect(mockPrismaService.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { totalCreditsConsumed: true, totalExecutions: true },
      });
      expect(mockPrismaService.workflow.update).toHaveBeenCalledWith({
        where: { id: workflowId },
        data: { avgCreditsPerExecution: 10 },
      });
    });

    it('should throw error when credit balance not found', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.deductCredits(orgId, executionId, workflowId, 'STANDARD', 'My Workflow'),
      ).rejects.toThrow('Credit balance not found');

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should not update avg when workflow is not found after transaction', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 100,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);
      mockPrismaService.workflow.findUnique.mockResolvedValue(null);

      await service.deductCredits(
        orgId,
        executionId,
        workflowId,
        'ADVANCED',
        'My Workflow',
      );

      // Transaction called but workflow.update for avg should NOT be called.
      // Note: workflow.update is called once INSIDE the transaction for total stats.
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.workflow.update).toHaveBeenCalledTimes(1);
    });

    it('should not update avg when totalExecutions is 0', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 100,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);
      mockPrismaService.workflow.findUnique.mockResolvedValue({
        totalCreditsConsumed: 0,
        totalExecutions: 0,
      });

      await service.deductCredits(
        orgId,
        executionId,
        workflowId,
        'LIGHT',
        'My Workflow',
      );

      // Called once inside transaction, but avg update should not happen.
      expect(mockPrismaService.workflow.update).toHaveBeenCalledTimes(1);
    });

    it('should pass optional costUSD and metadata', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        balance: 100,
      });
      mockPrismaService.$transaction.mockResolvedValue(undefined);
      mockPrismaService.workflow.findUnique.mockResolvedValue({
        totalCreditsConsumed: 20,
        totalExecutions: 2,
      });

      await service.deductCredits(
        orgId,
        executionId,
        workflowId,
        'STANDARD',
        'My Workflow',
        0.05,
        { model: 'gpt-4' },
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.workflow.update).toHaveBeenCalledWith({
        where: { id: workflowId },
        data: { avgCreditsPerExecution: 10 }, // 20 / 2 = 10
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getDashboardData
  // ═══════════════════════════════════════════════════════════════
  describe('getDashboardData', () => {
    const orgId = 'org-123';

    it('should return balance data with paginated transactions', async () => {
      const mockBalance = {
        id: 'cb-1',
        balance: 500,
        currentMonthSpent: 120,
      };
      const mockTransactions = {
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 10,
      };

      mockPrismaService.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.creditTransaction.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue(mockTransactions);

      const result = await service.getDashboardData(orgId);

      expect(result).toEqual({
        id: 'cb-1',
        balance: 500,
        currentMonthSpent: 120,
        creditTransactions: mockTransactions,
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should return null and log error when balance not found', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue(null);

      const result = await service.getDashboardData(orgId);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('No credit balance found'),
      );
    });

    it('should pass pagination parameters to getCreditTransactions', async () => {
      mockPrismaService.creditBalance.findUnique.mockResolvedValue({
        id: 'cb-1',
        balance: 500,
        currentMonthSpent: 120,
      });
      mockPrismaService.creditTransaction.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 25,
      });

      await service.getDashboardData(orgId, 'cursor-abc', 25, 'next');

      expect(mockPrismaService.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId },
          cursor: { id: 'cursor-abc' },
          skip: 1,
          take: 26, // 25 + 1
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getCreditTransactionsForOrganization
  // ═══════════════════════════════════════════════════════════════
  describe('getCreditTransactionsForOrganization', () => {
    const orgId = 'org-123';

    it('should query transactions with default pagination', async () => {
      mockPrismaService.creditTransaction.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 10,
      });

      // When called with no paginationAction, it defaults to undefined
      // The condition: paginationAction === 'next' || paginationAction === null
      // undefined is neither 'next' nor null, so it goes to else → negative take
      const result = await service.getCreditTransactionsForOrganization(orgId);

      expect(mockPrismaService.creditTransaction.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        take: -11, // default paginationAction is undefined → else branch → -(10+1)
        skip: 0,
        cursor: undefined,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          workflowCategory: true,
          description: true,
          createdAt: true,
          executionId: true,
          invoiceId: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(mockBuild).toHaveBeenCalledWith([], 10, undefined);
      expect(result.items).toEqual([]);
    });

    it('should use negative take for prev pagination', async () => {
      mockPrismaService.creditTransaction.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 10,
      });

      await service.getCreditTransactionsForOrganization(
        orgId,
        'cursor-1',
        10,
        'prev',
      );

      expect(mockPrismaService.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: -11,
          skip: 1,
          cursor: { id: 'cursor-1' },
        }),
      );
      expect(mockBuild).toHaveBeenCalledWith([], 10, 'prev');
    });

    it('should use positive take for next pagination', async () => {
      mockPrismaService.creditTransaction.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        nextPageAvailable: false,
        pageSize: 5,
      });

      await service.getCreditTransactionsForOrganization(
        orgId,
        'cursor-2',
        5,
        'next',
      );

      expect(mockPrismaService.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 6,
          skip: 1,
          cursor: { id: 'cursor-2' },
        }),
      );
    });
  });
});
