import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from '../services/events.service';
import { UserPayload } from '../../common/types/jwt-payload.type';
import { Subject } from 'rxjs';
import { UserRole } from '@tesseract/types';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: EventsService;

  const mockUser: UserPayload = {
    sub: 'u-1',
    name: 'Test User',
    organizationId: 'org-1',
    role: UserRole.OWNER,
    email: 'test@example.com',
  };

  const createMockStream = (subject: Subject<any>) => jest.fn().mockReturnValue(subject.asObservable());

  // Subjects
  const streams = {
    organization: new Subject<any>(),
    workflow: new Subject<any>(),
    conversation: new Subject<any>(),
    user: new Subject<any>(),
    creditBalance: new Subject<any>(),
    creditTransaction: new Subject<any>(),
    endUser: new Subject<any>(),
    execution: new Subject<any>(),
    apiKey: new Subject<any>(),
    invoice: new Subject<any>(),
    subscription: new Subject<any>(),
    appNotification: new Subject<any>(),
  };

  const mockEventsService = {
    getOrganizationStream: createMockStream(streams.organization),
    getWorkflowStream: createMockStream(streams.workflow),
    getConversationsStream: createMockStream(streams.conversation),
    getUserStream: createMockStream(streams.user),
    getCreditBalanceStream: createMockStream(streams.creditBalance),
    getCreditTransactionsStream: createMockStream(streams.creditTransaction),
    getEndUserStream: createMockStream(streams.endUser),
    getExecutionStream: createMockStream(streams.execution),
    getApiKeysStream: createMockStream(streams.apiKey),
    getInvoiceStream: createMockStream(streams.invoice),
    getSubscriptionStream: createMockStream(streams.subscription),
    getAppNotificationsStream: createMockStream(streams.appNotification),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    eventsService = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('SSE endpoints', () => {
    it('getOrganizationStream should filter by organizationId', (done) => {
      const stream$ = controller.getOrganizationStream(mockUser);
      stream$.subscribe((event: any) => {
        expect(event.data.organizationId).toBe('org-1');
        done();
      });
      
      // Should be ignored
      streams.organization.next({ data: { organizationId: 'org-2' } });
      // Should be processed
      streams.organization.next({ data: { organizationId: 'org-1' } });
    });

    it('getWorkflowStream should filter by organizationId', (done) => {
      const stream$ = controller.getWorkflowStream(mockUser);
      stream$.subscribe((event: any) => {
        expect(event.data.organizationId).toBe('org-1');
        done();
      });
      streams.workflow.next({ data: { organizationId: 'org-1' } });
    });

    it('getAppNotificationsStream should filter by organizationId and role', (done) => {
        const stream$ = controller.getAppNotificationsStream(mockUser);
        stream$.subscribe((event: any) => {
          expect(event.data.message).toBe('Test Alert');
          done();
        });
        
        // Ignored by org
        streams.appNotification.next({ data: { organizationId: 'org-2', roles: [UserRole.OWNER], notification: { message: 'Alert' } } });
        // Ignored by role
        streams.appNotification.next({ data: { organizationId: 'org-1', roles: [UserRole.VIEWER], notification: { message: 'Alert' } } });
        // Processed
        streams.appNotification.next({ data: { organizationId: 'org-1', roles: [UserRole.OWNER], notification: { message: 'Test Alert' } } });
    });
  });
});
