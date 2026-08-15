'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Loader2, RotateCcw, Send, User } from 'lucide-react';
import { useAdminTestExecuteStream } from '@/hooks/automation/use-admin-workflows';
import type { AdminWorkflowDetail } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { inputClass } from '@/app/[locale]/admin/_styles';

interface Props {
  workflow: AdminWorkflowDetail;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Corre el workflow tal cual lo haría el cliente (mismo `executeStream()` del
 * gateway), pero por el canal `admin-test`: no descuenta créditos ni cuenta en las
 * estadísticas de la organización — ver el comentario de
 * `WorkflowsExecutionAdminController`. El backend (`assertInternalForTesting`) rechaza
 * probar acá un workflow ya publicado, así que si no es interno ni se intenta.
 *
 * Solo streaming por ahora (v1): es lo que da la mejor experiencia para probar un
 * workflow conversacional y ya existe todo el parseo SSE probado en producción para
 * calcarlo (ver workflows-admin-test-stream.ts). Las variantes síncrona/async+polling
 * del backend quedan sin usar hasta que haga falta un caso que streaming no cubra.
 */
export function TestTab({ workflow }: Props) {
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const { execute, messages: streamContent, isStreaming, error, clear } =
    useAdminTestExecuteStream();
  const wasStreamingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Vuelca el streaming al hilo en vivo, token a token — mismo patrón que el chat real
  // en (dashboard)/conversations/[conversationId]/page.tsx: mientras isStreaming (o en
  // la transición true→false de un stream que llegó todo junto) reemplaza el último
  // mensaje si ya es del assistant, si no agrega uno nuevo.
  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;

    if ((isStreaming || justFinished) && streamContent) {
      setThread((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.id.startsWith('streaming-')) {
          return [...prev.slice(0, -1), { ...last, content: streamContent }];
        }
        return [
          ...prev,
          { id: `streaming-${Date.now()}`, role: 'assistant', content: streamContent },
        ];
      });
    }
  }, [streamContent, isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length, isStreaming]);

  if (!workflow.isInternal) {
    return (
      <div className="max-w-2xl rounded-lg border border-border p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-text-primary">
          <AlertTriangle size={14} /> Este workflow ya está publicado
        </p>
        <p className="mt-1 text-text-secondary">
          Solo se pueden probar acá los workflows internos — el backend rechaza la prueba de uno
          ya publicado para no descontarle créditos ni ejecuciones falsas al cliente. Márcalo como
          "Interno" de nuevo desde Ajustes si necesitas seguir probándolo.
        </p>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setThread((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed }]);
    setInput('');

    execute(
      workflow.id,
      workflow.organization.id,
      { message: trimmed },
      conversationId ? { conversationId } : undefined,
      (event, data) => {
        if (event === 'conversation_id') setConversationId(data);
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setThread([]);
    setInput('');
    setConversationId(undefined);
    clear();
  };

  const lastId = thread[thread.length - 1]?.id;

  return (
    <div className="flex h-[70vh] max-w-3xl flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          Canal <code className="font-mono">admin-test</code>: no descuenta créditos ni cuenta en
          las estadísticas de {workflow.organization.name}.
        </p>
        <button
          type="button"
          onClick={handleReset}
          disabled={thread.length === 0 && !conversationId}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
        >
          <RotateCcw size={12} /> Nueva conversación de prueba
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border p-4">
        {thread.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-text-secondary">
            Escribe un mensaje para empezar a probar "{workflow.name}".
          </p>
        ) : (
          <div className="space-y-4">
            {thread.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex max-w-[85%] gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      msg.role === 'user' ? 'bg-accent text-text-inverse' : 'bg-surface-secondary'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User size={12} strokeWidth={2.5} />
                    ) : (
                      <div
                        className={`relative h-4 w-4 ${
                          isStreaming && msg.id === lastId ? 'animate-spin' : ''
                        }`}
                      >
                        <Image
                          src="/favicon.svg"
                          alt=""
                          fill
                          className="object-contain [filter:var(--logo-filter)]"
                        />
                      </div>
                    )}
                  </div>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-surface-message text-text-primary'
                        : 'text-text-primary'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : msg.content ? (
                      <div className="prose prose-sm max-w-none break-words text-text-primary [&>p:last-child]:mb-0 [&>p]:mb-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <Loader2 size={14} className="animate-spin text-text-secondary" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger-600">
            {error?.message ?? 'No se pudo ejecutar el workflow'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe como si fueras el cliente… (Enter envía, Shift+Enter salto de línea)"
          className={`${inputClass} flex-1 resize-none`}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
