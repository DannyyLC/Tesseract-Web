import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { EventSubjectType } from '../utils/subjects-enum';

@Injectable()
export class EventsService {
  private readonly organizationSubject = new Subject<MessageEvent>();
  private readonly workflowSubject = new Subject<MessageEvent>();
  private readonly conversationsSubject = new Subject<MessageEvent>();
  constructor(){}
  // POST method will call this to push data
  asyncemitEvent(model: string, action: string, data: any) {
    switch (model) {
      case EventSubjectType.ORGANIZATION:
        this.organizationSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      case EventSubjectType.WORKFLOW:
        this.workflowSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      case EventSubjectType.CONVERSATION:
      case EventSubjectType.MESSAGE:
        this.conversationsSubject.next({ 
          id: data.id,
          data: data,
          type: `${model}.${action}`,
          retry: 3000
         });
        break;

      default:
        break;
    }
  }

  getOrganizationStream(): Observable<MessageEvent> {
    return this.organizationSubject.asObservable();
  }

  getWorkflowStream(): Observable<MessageEvent> {
    return this.workflowSubject.asObservable();
  }

  getConversationsStream(): Observable<MessageEvent> {
    return this.conversationsSubject.asObservable();
  }
}
