'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Coins,
  Loader2,
  Mic,
  Send,
  SquarePen,
  User,
  Zap,
} from 'lucide-react';
import {
  useAdminTestExecuteStream,
  useAdminWorkflowMutations,
} from '@/hooks/automation/use-admin-workflows';
import { useDictation } from '@/hooks/use-dictation';
import RecordingBar from '@/components/ui/recording-bar';
import type {
  AdminTestExecutionDetail,
  AdminWorkflowDetail,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';

interface Props {
  workflow: AdminWorkflowDetail;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ExecRecord {
  turnId: string;
  executionId?: string;
  /** `polling`: post-procesamiento del gateway aún en vuelo tras cerrar el stream. */
  status: 'starting' | 'polling' | 'done';
  detail: AdminTestExecutionDetail | null;
}

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: '✔ Completado', className: 'bg-success/10 text-success-600' },
  FAILED: { label: '✖ Falló', className: 'bg-danger/10 text-danger-600' },
  RUNNING: { label: '⏳ Corriendo', className: 'bg-warning/10 text-warning-600' },
  PENDING: { label: '⏳ Pendiente', className: 'bg-warning/10 text-warning-600' },
  CANCELLED: { label: 'Cancelada', className: 'bg-neutral-500/10 text-neutral-600' },
  TIMEOUT: { label: 'Tiempo agotado', className: 'bg-neutral-500/10 text-neutral-600' },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// El stream cierra apenas termina de emitir tokens, pero el post-procesamiento
// (guardar mensaje, calcular costo, marcar COMPLETED/FAILED) sigue en background del
// lado del gateway — ver el comentario en handleStreamFilteringAndMonitoring(). Pedir
// la ejecución una sola vez justo al cerrar el stream casi siempre la agarra a medias
// (PENDING/RUNNING). Se reintenta unas pocas veces con espera corta hasta que quede
// en un estado final, o se agotan los intentos y se muestra lo último que haya.
const POLL_INTERVAL_MS = 500;
const POLL_MAX_TRIES = 10;

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
  const [execHistory, setExecHistory] = useState<ExecRecord[]>([]);
  const { execute, messages: streamContent, isStreaming, error, clear } =
    useAdminTestExecuteStream();
  const { getTestExecution } = useAdminWorkflowMutations();

  // Mismo dictado que el chat real de conversaciones: transcribe y lo pone en el
  // composer, no lo manda solo — el operador puede corregir antes de enviar.
  const handleTranscribed = (text: string) => {
    setInput((previous) => (previous.trim() ? `${previous.trim()} ${text}` : text));
  };
  const dictation = useDictation(handleTranscribed);

  const wasStreamingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelBottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    panelBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [execHistory.length, execHistory[execHistory.length - 1]?.status]);

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

  const pollExecution = async (turnId: string, executionId: string) => {
    for (let attempt = 0; attempt < POLL_MAX_TRIES; attempt++) {
      try {
        const detail = await getTestExecution.mutateAsync({
          executionId,
          organizationId: workflow.organization.id,
        });
        const settled = detail.status !== 'PENDING' && detail.status !== 'RUNNING';
        setExecHistory((prev) =>
          prev.map((rec) =>
            rec.turnId === turnId ? { ...rec, detail, status: settled ? 'done' : 'polling' } : rec,
          ),
        );
        if (settled) return;
      } catch {
        // Un intento fallido no debe tumbar el polling completo — se reintenta.
      }
      await sleep(POLL_INTERVAL_MS);
    }
    // Se agotaron los intentos: se deja marcado como terminado igual, con lo último
    // que se haya alcanzado a leer (mejor eso que un spinner colgado para siempre).
    setExecHistory((prev) =>
      prev.map((rec) => (rec.turnId === turnId ? { ...rec, status: 'done' } : rec)),
    );
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const turnId = `turn-${Date.now()}`;
    setThread((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed }]);
    setInput('');
    setExecHistory((prev) => [...prev, { turnId, status: 'starting', detail: null }]);

    let executionId: string | undefined;

    await execute(
      workflow.id,
      workflow.organization.id,
      { message: trimmed },
      conversationId ? { conversationId } : undefined,
      (event, data) => {
        if (event === 'conversation_id') setConversationId(data);
        if (event === 'execution_id') {
          executionId = data;
          setExecHistory((prev) =>
            prev.map((rec) => (rec.turnId === turnId ? { ...rec, executionId: data } : rec)),
          );
        }
      },
    );

    if (!executionId) {
      // No debería pasar (el backend manda `execution_id` al abrir el stream), pero si
      // por lo que sea nunca llega, mejor mostrar "sin detalle" que dejar la tarjeta
      // pegada en "ejecutando" para siempre.
      setExecHistory((prev) =>
        prev.map((rec) => (rec.turnId === turnId ? { ...rec, status: 'done' } : rec)),
      );
      return;
    }
    await pollExecution(turnId, executionId);
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
    setExecHistory([]);
    clear();
  };

  const lastId = thread[thread.length - 1]?.id;

  return (
    // La altura fija en móvil (70vh) es un fallback nomás — ahí no es prioridad.
    // En desktop (lg+) sí importa: `lg:h-[calc(100vh-9rem)]` resta la barra sticky
    // de arriba (título + tabs, ~93px con su margen) y el padding inferior del
    // layout de admin (lg:p-8, 32px), para que el chat ocupe todo lo que queda del
    // viewport en vez de quedarse corto con un porcentaje arbitrario.
    <div className="flex h-[70vh] w-full gap-4 lg:h-[calc(100vh-9rem)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            disabled={thread.length === 0 && !conversationId}
            title="Nueva conversación de prueba"
            aria-label="Nueva conversación de prueba"
            className="flex-shrink-0 rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <SquarePen size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                      {msg.role === 'user' ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-text-inverse">
                          <User size={12} strokeWidth={2.5} />
                        </div>
                      ) : (
                        // Sin badge/círculo de fondo: es el logo de Tesseract, no un
                        // avatar genérico — se ve mejor suelto que metido en una insignia.
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

        <div className="mt-3 flex items-end gap-2 rounded-[26px] border border-border bg-surface p-2 pl-4 shadow-sm transition-shadow focus-within:shadow-md">
          {dictation.isActive ? (
            <RecordingBar
              analyser={dictation.analyser}
              seconds={dictation.seconds}
              isProcessing={dictation.state === 'processing'}
              isTranscribingSegment={dictation.isTranscribingSegment}
              transcript={input}
              onStop={dictation.stop}
              onCancel={dictation.cancel}
            />
          ) : (
            <>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe como si fueras el cliente… (Enter envía, Shift+Enter salto de línea)"
                className="scrollbar-hide max-h-[120px] min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent py-2 text-sm leading-relaxed text-text-primary outline-none placeholder:text-input-placeholder"
              />
              <button
                type="button"
                onClick={dictation.start}
                disabled={isStreaming}
                title="Dictar por voz"
                aria-label="Dictar por voz"
                className="flex-shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Mic size={20} />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="mb-0.5 mr-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Panel de ejecuciones — oculto por debajo de lg: el chat ya va apretado ahí y
          esta pantalla es casi exclusiva de desktop. w-96 y no w-80: con el chat ya
          sin tope de ancho, dejar el panel angosto se sentía desperdiciado — más aire
          para leer un stack trace sin que se vuelva un scroll horizontal. */}
      <div className="hidden w-96 shrink-0 flex-col lg:flex">
        <p className="mb-3 text-xs font-medium text-text-secondary">Ejecuciones de esta sesión</p>
        <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
          {execHistory.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-xs text-text-secondary">
              Cuando mandes un mensaje, el resultado de cada ejecución aparece acá.
            </p>
          ) : (
            execHistory.map((rec, i) => <ExecutionCard key={rec.turnId} record={rec} turn={i + 1} />)
          )}
          <div ref={panelBottomRef} />
        </div>
      </div>
    </div>
  );
}

function ExecutionCard({ record, turn }: { record: ExecRecord; turn: number }) {
  const { detail, status } = record;
  const style = detail ? (STATUS_STYLE[detail.status] ?? STATUS_STYLE.PENDING) : null;
  const cost = detail ? Number(detail.cost) : 0;

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text-primary">Turno {turn}</span>
        {status !== 'done' ? (
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <Loader2 size={11} className="animate-spin" />
            {status === 'starting' ? 'ejecutando…' : 'procesando…'}
          </span>
        ) : style ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}>
            {style.label}
          </span>
        ) : (
          <span className="text-text-tertiary">sin detalle</span>
        )}
      </div>

      {detail && (
        <>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> {detail.duration ?? 0}s
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap size={11} /> {detail.tokensUsed ?? 0} tok
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins size={11} /> ${cost.toFixed(4)}
            </span>
          </div>

          {detail.status === 'FAILED' && detail.error && (
            <div className="mt-2 rounded-md bg-danger/10 p-2 text-danger-600">
              <p className="break-words">{detail.error}</p>
              {detail.errorStack && (
                <details className="mt-1">
                  <summary className="flex cursor-pointer items-center gap-1 text-[10px] font-medium select-none">
                    <ChevronDown size={10} /> stack trace
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-secondary p-1.5 text-[10px] whitespace-pre-wrap text-text-secondary">
                    {detail.errorStack}
                  </pre>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
