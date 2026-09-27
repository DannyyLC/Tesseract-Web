import { useEffect, useRef } from 'react';
import SseRequestManager from '@/lib/api/sse-request-manager';

type MessageHandler = (data: unknown, event?: MessageEvent) => void;

export default function useEvents() {
  // store active EventSource instances keyed by endpoint
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    // El Map se crea una vez y nunca se reasigna; se copia para el cleanup, como pide React.
    const sources = sourcesRef.current;
    return () => {
      // cleanup all connections on unmount
      sources.forEach((src) => {
        try {
          src.close();
        } catch {
          // ignore
        }
      });
      sources.clear();
    };
  }, []);

  function subscribe(endpoint: string, eventType: string, handler: MessageHandler): () => void {
    // normalize endpoint
    const key = endpoint;

    // if already exists, attach another listener
    let source = sourcesRef.current.get(key);
    if (!source) {
      source = SseRequestManager.create(endpoint);
      sourcesRef.current.set(key, source);
    }

    const messageListener = (event: MessageEvent) => {
      let parsed = event.data;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        // keep raw if not json
      }
      handler(parsed, event);
    };

    source.addEventListener(eventType, messageListener as EventListener);

    // return unsubscribe function for this listener
    return () => {
      try {
        source?.removeEventListener(eventType, messageListener as EventListener);
        // if no more listeners, close source
        // There's no straightforward way to inspect listeners, so we keep the source open until unsubscribeAll or unmount.
      } catch {
        // ignore
      }
    };
  }

  function unsubscribeAll() {
    sourcesRef.current.forEach((src) => {
      try {
        src.close();
      } catch {
        // ignore
      }
    });
    sourcesRef.current.clear();
  }

  return { subscribe, unsubscribeAll };
}
