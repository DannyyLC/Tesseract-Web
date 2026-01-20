import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class EventsService {

  private readonly eventSubject = new Subject<MessageEvent>();
  private readonly userVerificationSubject = new Subject<MessageEvent>();
  constructor(){}
  // POST method will call this to push data
  emitEvent(model: string, action: string, data: any) {
    switch (model) {
      case 'UserVerification':
        this.userVerificationSubject.next({ 
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

  // SSE route will subscribe to this
  getEventStream(): Observable<MessageEvent> {
    return this.eventSubject.asObservable();
  }

  getUserVerificationStream(): Observable<MessageEvent> {
    return this.userVerificationSubject.asObservable();
  }
}
