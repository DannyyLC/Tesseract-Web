import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../database/prisma.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UtilityService } from '../../utility/utility.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Subject } from 'rxjs';
import { EventSubjectType } from '../utils/subjects-enum';

describe('EventsService', () => {
  let service: EventsService;

  const mockDbMutationsSubject = new Subject<any>();

  const mockPrismaService = {
    dbMutations$: mockDbMutationsSubject.asObservable(),
    conversation: {
      findFirst: jest.fn(),
    },
  };

  const mockOrganizationsService = {
    getSubscriptionData: jest.fn(),
  };

  const mockAppNotificationsSubject = new Subject<any>();
  const mockUtilityService = {
    getAppNotificationsSubject: jest.fn().mockReturnValue(mockAppNotificationsSubject),
  };

  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: UtilityService, useValue: mockUtilityService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Streams', () => {
    it('should return observables for all streams', () => {
      expect(service.getOrganizationStream()).toBeDefined();
      expect(service.getWorkflowStream()).toBeDefined();
      expect(service.getConversationsStream()).toBeDefined();
      expect(service.getUserStream()).toBeDefined();
      expect(service.getCreditBalanceStream()).toBeDefined();
      expect(service.getCreditTransactionsStream()).toBeDefined();
      expect(service.getEndUserStream()).toBeDefined();
      expect(service.getExecutionStream()).toBeDefined();
      expect(service.getApiKeysStream()).toBeDefined();
      expect(service.getInvoiceStream()).toBeDefined();
      expect(service.getLlmModelStream()).toBeDefined();
      expect(service.getSubscriptionStream()).toBeDefined();
      expect(service.getAppNotificationsStream()).toBeDefined();
    });
  });

  describe('emitEvent', () => {
    it('should not emit if action is upsertd, updateManyd, deleteManyd, createManyd', async () => {
      const spy = jest.spyOn(service, 'getFormattedData');
      await service.emitEvent(EventSubjectType.USER, 'upsertd', {});
      expect(spy).not.toHaveBeenCalled();
    });

    it('should format and emit organization event', (done) => {
      mockOrganizationsService.getSubscriptionData.mockResolvedValueOnce({});
      const subscription = service.getOrganizationStream().subscribe((event) => {
        expect(event.type).toBe('Organization.created');
        expect(event.id).toBe('org-1');
        subscription.unsubscribe();
        done();
      });

      service.emitEvent(EventSubjectType.ORGANIZATION, 'created', {
        id: 'org-1',
        name: 'Test Org',
      });
    });

    it('should format and emit user event', (done) => {
      const subscription = service.getUserStream().subscribe((event) => {
        expect(event.type).toBe('User.created');
        expect(event.id).toBe('u-1');
        subscription.unsubscribe();
        done();
      });

      service.emitEvent(EventSubjectType.USER, 'created', {
        id: 'u-1',
        email: 'test@example.com',
      });
    });
  });

  describe('getFormattedData', () => {
    it('should handle unmapped models by returning null', async () => {
       const result = await service.getFormattedData('UNKNOWN_MODEL' as EventSubjectType, {});
       expect(result).toBeNull();
    });

    it('should format MESSAGE correctly by querying conversation', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue({
        id: 'c-1',
        userId: 'admin',
      });
      const result = await service.getFormattedData(EventSubjectType.MESSAGE, { conversationId: 'c-1' });
      expect(result).toEqual(expect.objectContaining({
        id: 'c-1',
        isInternal: true,
      }));
    });
  });
});
