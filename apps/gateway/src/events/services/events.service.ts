import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class EventsService {
private readonly eventSubject = new Subject<MessageEvent>();

  // POST method will call this to push data
  emitEvent(data: any) {
    this.eventSubject.next({ data });
  }

  // SSE route will subscribe to this
  getEventStream(): Observable<MessageEvent> {
    return this.eventSubject.asObservable();
  }
}
