'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  User,
  Loader2,
  ArrowLeft,
  Trash2,
  Archive,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useWorkflow, useExecuteStream } from '@/hooks/useWorkflows';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { useConversation, useConversationMutations } from '@/hooks/useConversations';
import { useUser } from '@/hooks/useUsers';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from '@/components/ui/modal';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_PERMISSIONS } from '@tesseract/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function WorkflowChatPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;

  // Obtener detalles de la conversación primero
  // Si conversationId es 'new', no intentamos cargar la conversación
  const isNewConversation = conversationId === 'new';
  const { data: conversationData, isLoading: isLoadingConversation } = useConversation(
    isNewConversation ? '' : conversationId,
  );

  // Gestión de URL y router (Moved up for early access)
  const searchParams = useSearchParams();
  const router = useRouter();
  const workflowIdFromUrl = searchParams.get('workflowId');

  // Obtener detalles del workflow usando el ID de la conversación o el query param
  const { data: workflow, isLoading: isLoadingWorkflow } = useWorkflow(
    conversationData?.workflowId || workflowIdFromUrl || '',
  );

  // Obtener detalles del usuario
  const { data: user, isLoading: isLoadingUser } = useUser(conversationData?.userId || '');

  // Hook de streaming
  const { execute, messages: streamContent, isStreaming, error, clear } = useExecuteStream();

  // Mutations
  const { updateConversation, deleteConversation } = useConversationMutations();

  const { data: authUser } = useAuth();
  const userPermissions = authUser ? ROLE_PERMISSIONS[authUser.role] || [] : [];
  const canUpdate = userPermissions.includes('conversations:update');

  const [isEditing, setIsEditing] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  useEffect(() => {
    if (conversationData?.title) {
      setRenameValue(conversationData.title);
    } else if (workflow?.name) {
      setRenameValue(workflow.name);
    }
  }, [conversationData, workflow]);

  // Estado local de mensajes acumulados
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasStreamingRef = useRef(false);

  // Draft persistence
  const { loadDraft, saveDraft, clearDraft, migrateDraft } = useDraftPersistence(
    conversationId,
    workflowIdFromUrl || conversationData?.workflowId,
  );

  // Ref para guardar el ID de conversación pendiente mientras se hace streaming
  const pendingConversationId = useRef<string | null>(null);

  const isExternalUser = conversationData && !conversationData.userId;

  // Cargar borrador al montar el componente
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setInput(draft);
    }
  }, [conversationId, loadDraft]);

  // Guardar borrador cuando cambia el input (con debouncing automático)
  useEffect(() => {
    saveDraft(input);
  }, [input, saveDraft]);

  // Efecto para cargar historial de conversación
  useEffect(() => {
    if (conversationData && conversationData.messages) {
      // Si estamos haciendo streaming, NO sobrescribir con datos del servidor
      if (isStreaming) return;

      const serverMessages: Message[] = conversationData.messages.map((msg: any) => ({
        id: msg.id || Date.now().toString(),
        role: (msg.role as string).toLowerCase() as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.createdAt
          ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
      }));

      setMessages((currentMessages) => {
        // Si no tenemos mensajes locales, usamos los del servidor
        if (currentMessages.length === 0) return serverMessages;

        // Estrategia de fusión inteligente (Anchor Match):
        // Buscamos el punto de sincronización: el último mensaje del servidor que existe en local.
        const lastServerMessage = serverMessages[serverMessages.length - 1];

        // Caso 1: El servidor tiene más mensajes o los mismos (recarga o navegación normal)
        // Si el último mensaje del servidor NO está en local, podría ser que el servidor avanzó (otra tab) o es carga inicial
        const localIndex = currentMessages.findIndex((m) => m.id === lastServerMessage?.id);

        if (localIndex !== -1) {
          // El servidor y local coinciden hasta cierto punto.
          // Verificamos si local tiene MÁS mensajes después de ese punto (ej: acabamos de mandar uno)
          if (localIndex < currentMessages.length - 1) {
            // Mantenemos la historia del servidor hasta el match, y agregamos la cola local
            const localTail = currentMessages.slice(localIndex + 1);
            return [...serverMessages, ...localTail];
          }
        }

        // Caso especial: El servidor NO trae el último mensaje que acabamos de generar (retraso de indexación/DB)
        // Buscamos el último mensaje LOCAL en el servidor
        const lastLocalMessage = currentMessages[currentMessages.length - 1];
        const serverHasIt = serverMessages.some((m) => m.id === lastLocalMessage.id);

        if (!serverHasIt) {
          // El servidor no tiene nuestro último mensaje.
          // Asumimos que es nuevo y lo preservamos adjuntándolo a lo que diga el servidor.
          // PERO debemos tener cuidado de duplicados si el ID no matchea (ej: ID temporal vs ID real).
          // Por simplicidad en este flujo: si local tiene 'tail' que no está en server, lo guardamos.

          // Buscamos el último mensaje del servidor en nuestra lista local para saber dónde 'cortar y pegar'
          // Iteramos hacia atrás en serverMessages para encontrar el primer match en local
          let matchIndexInLocal = -1;
          let matchIndexInServer = -1;

          for (let i = serverMessages.length - 1; i >= 0; i--) {
            const sMsg = serverMessages[i];
            const lIndex = currentMessages.findIndex(
              (m) => m.id === sMsg.id || (m.content === sMsg.content && m.role === sMsg.role),
            );
            if (lIndex !== -1) {
              matchIndexInLocal = lIndex;
              matchIndexInServer = i;
              break;
            }
          }

          if (matchIndexInLocal !== -1) {
            // Tenemos un punto común.
            // Server: [...A, B]
            // Local:  [...A, B, C, D]
            // Result: [...A, B (from server), C, D]
            const localTail = currentMessages.slice(matchIndexInLocal + 1);
            return [...serverMessages.slice(0, matchIndexInServer + 1), ...localTail];
          } else {
            // Disjoint sets? Raro. Usualmente server es master.
            // Pero si acabamos de navegar a /new y empezamos a chatear, server podría venir vacío o parcial.
            // Si server viene vacío y local tiene cosas, nos quedamos con local?
            if (serverMessages.length === 0 && currentMessages.length > 0) {
              return currentMessages;
            }

            // Si no hay match fiable, mantenemos local (user priority) si estamos en medio de una interacción
            // Ojo: esto podría desincronizar si editamos en otro lado. Pero el usuario pidió prioridad local.
            return currentMessages.length > serverMessages.length
              ? currentMessages
              : serverMessages;
          }
        }

        return serverMessages;
      });

      // Solo scrollear si cambió significativamente o es carga inicial
      if (messages.length === 0) {
        setTimeout(scrollToBottom, 100);
      }
    }
  }, [conversationData, isStreaming]);

  useEffect(() => {
    const isExternalUser = conversationData && !conversationData.userId;
    if (isExternalUser) {
      wasStreamingRef.current = isStreaming;
      return;
    }

    // Activo durante streaming O en la transición true→false (stream buffered que llega todo junto)
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;

    if ((isStreaming || justFinished) && streamContent) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          return [...prev.slice(0, -1), { ...lastMsg, content: streamContent }];
        }
        return [
          ...prev,
          {
            id: `streaming-${Date.now()}`,
            role: 'assistant',
            content: streamContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
      });
      scrollToBottom();
    }
  }, [streamContent, isStreaming, conversationData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll when messages change or streaming is active
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isStreaming]);

  // Ajuste de altura del textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [input]);

  // Efecto para actualizar la URL SOLO cuando termine el streaming
  useEffect(() => {
    if (!isStreaming && pendingConversationId.current) {
      const newUrl = `/conversations/${pendingConversationId.current}`;
      router.replace(newUrl);
      pendingConversationId.current = null;
    }
  }, [isStreaming, router]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: isExternalUser ? 'assistant' : 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Mantener foco en el input
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);

    // Limpiar estado previo del stream
    clear();

    // Ejecutar workflow
    const currentWorkflowId = conversationData?.workflowId || workflowIdFromUrl;

    // Generar título tentativo (primeras 5 palabras)
    const generatedTitle = input.trim().split(/\s+/).slice(0, 5).join(' ');

    if (currentWorkflowId) {
      execute(
        currentWorkflowId,
        { message: userMsg.content },
        isNewConversation ? undefined : { conversationId }, // Metadata only if existing conversation
        (event, data) => {
          // Si recibimos el ID
          if (event === 'conversation_id') {
            // Si es una conversacion nueva (ID recibido != ID actual URL)
            if (data !== conversationId) {
              pendingConversationId.current = data;

              // Migrar borrador si venimos de 'new'
              if (isNewConversation) {
                migrateDraft(data);
              }

              // Actualizar el título automáticamente si venimos de 'new'
              if (isNewConversation) {
                updateConversation.mutate({
                  id: data,
                  data: { title: generatedTitle },
                });
              }
            }

            // Limpiar borrador después de confirmación del backend
            clearDraft();
          }
        },
        isNewConversation ? undefined : conversationId, // Para que el hook invalide el query al terminar
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoadingWorkflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-black/20 dark:text-white/20" size={32} />
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <PermissionGuard permissions="conversations:read" redirect={true} fallbackRoute="/dashboard">
      <div className="relative flex h-full flex-col bg-white dark:bg-[#0A0A0A]">
        {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-4 dark:border-white/5 dark:bg-[#0A0A0A]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="-ml-2 rounded-lg p-2 text-black/50 transition-colors hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/5"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            {isEditing ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (renameValue.trim()) {
                      updateConversation.mutate(
                        { id: conversationId, data: { title: renameValue } },
                        {
                          onSuccess: () => setIsEditing(false),
                        },
                      );
                    } else {
                      setIsEditing(false);
                    }
                  } else if (e.key === 'Escape') {
                    setRenameValue(conversationData?.title || '');
                    setIsEditing(false);
                  }
                }}
                onBlur={() => {
                  if (renameValue.trim() && renameValue !== conversationData?.title) {
                    updateConversation.mutate(
                      { id: conversationId, data: { title: renameValue } },
                      {
                        onSuccess: () => setIsEditing(false),
                      },
                    );
                  } else {
                    setIsEditing(false);
                  }
                }}
                autoFocus
                className="w-full min-w-[200px] border-b border-black/20 bg-transparent p-0 text-lg font-bold text-black outline-none dark:border-white/20 dark:text-white"
              />
            ) : (
              <h1
                onClick={() => {
                  if (canUpdate) {
                    setRenameValue(conversationData?.title || '');
                    setIsEditing(true);
                  }
                }}
                className={`flex items-center gap-2 text-lg font-bold text-black dark:text-white ${canUpdate ? 'cursor-pointer transition-opacity hover:opacity-70' : ''}`}
                title={canUpdate ? 'Haz clic para editar el nombre' : undefined}
              >
                {isEmpty ? workflow?.name : conversationData?.title || 'Nueva Conversación'}
              </h1>
            )}
            <p className="max-w-md truncate text-xs text-black/40 dark:text-white/40">
              {isEmpty ? (
                workflow?.description || 'Probador Interactivo'
              ) : (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-black/60 dark:text-white/60">
                    {workflow?.name}
                  </span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Status Indicator & Actions */}
        <div className="flex items-center gap-4">
          {/* User Badge - Relocated here */}
          {user && (
            <div className="hidden items-center gap-2 rounded-full border border-black/5 bg-black/5 px-3 py-1.5 sm:flex dark:border-white/5 dark:bg-white/5">
              <User size={14} className="text-black/40 dark:text-white/40" />
              <span className="max-w-[100px] truncate text-xs font-medium text-black/60 dark:text-white/60">
                {user.name}
              </span>
            </div>
          )}

          {/* Status & HITL Controls (Only for external users) */}
          {conversationData && (
            <div className="mr-2 flex items-center gap-2 border-r border-black/5 pr-4 dark:border-white/5">
              {/* HITL Toggle */}
              {!conversationData.userId && (
                <PermissionGuard permissions="conversations:update">
                  <button
                    onClick={() =>
                      updateConversation.mutate({
                        id: conversationId,
                        data: { isHumanInTheLoop: !conversationData.isHumanInTheLoop },
                      })
                    }
                    disabled={updateConversation.isPending}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      conversationData.isHumanInTheLoop
                        ? 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 dark:text-orange-400'
                        : 'bg-black/5 text-black/40 hover:bg-black/10 dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10'
                    }`}
                    title={
                      conversationData.isHumanInTheLoop
                        ? 'Reactivar IA (El bot volverá a responder automáticamente)'
                        : 'Tomar el control (Pausar IA y responder manualmente)'
                    }
                  >
                    {conversationData.isHumanInTheLoop ? 'Modo manual' : 'Tomar el control'}
                  </button>
                </PermissionGuard>
              )}

              {/* Status Toggle (Simple Open/Close for now) */}
              <PermissionGuard permissions="conversations:update">
                <button
                  onClick={() =>
                    updateConversation.mutate({
                      id: conversationId,
                      data: { status: conversationData.status === 'CLOSED' ? 'ACTIVE' : 'CLOSED' },
                    })
                  }
                  disabled={updateConversation.isPending}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all ${
                    conversationData.status === 'CLOSED'
                      ? 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                  }`}
                >
                  {conversationData.status === 'CLOSED' ? (
                    <>
                      <RefreshCw size={14} />
                      <span>Reabrir</span>
                    </>
                  ) : (
                    <>
                      <Archive size={14} />
                      <span>Cerrar</span>
                    </>
                  )}
                </button>
              </PermissionGuard>
            </div>
          )}

          {/* Additional Actions */}
          {!isNewConversation && (
            <div className="flex items-center gap-1">
              <PermissionGuard permissions="conversations:delete">
                <button
                  onClick={() => setIsDeleteOpen(true)}
                  disabled={deleteConversation.isPending}
                  className="rounded-full p-2 text-black/40 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-white/40"
                  title="Eliminar conversación"
                >
                  {deleteConversation.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </PermissionGuard>
            </div>
          )}

          {isStreaming && !isExternalUser ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Loader2 size={12} className="animate-spin" />
              Generando...
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium text-black/40 dark:bg-white/5 dark:text-white/40">
              <div className="h-1.5 w-1.5 rounded-full bg-current" />
              Listo
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="relative flex-1 overflow-y-auto p-6 pb-36">
        {/* Empty State */}
        <AnimatePresence>
          {isEmpty && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-32"
            >
              <div className="relative mb-6 h-24 w-24 animate-pulse">
                <Image
                  src="/favicon.svg"
                  alt="Tesseract"
                  fill
                  className="object-contain brightness-0 dark:invert"
                />
              </div>
              <h3 className="max-w-sm text-center text-xl font-medium text-black/30 dark:text-white/30">
                Comienza una conversación con <br />
                <span className="font-bold text-black/50 dark:text-white/50">{workflow?.name}</span>
              </h3>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages List */}
        <div className="mx-auto max-w-6xl space-y-6">
          {messages.map((msg, index) => {
            const isRightSide = isExternalUser ? msg.role === 'assistant' : msg.role === 'user';

            return (
              <motion.div
                key={msg.id || index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isRightSide ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex max-w-[80%] gap-4 ${isRightSide ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                      msg.role === 'user'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-transparent'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User size={16} strokeWidth={2.5} />
                    ) : (
                      <div
                        className={`relative h-6 w-6 ${
                          isStreaming && index === messages.length - 1 && msg.role === 'assistant'
                            ? 'animate-spin'
                            : ''
                        }`}
                      >
                        <Image
                          src="/favicon.svg"
                          alt="AI"
                          fill
                          className="object-contain brightness-0 dark:invert"
                        />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className={`flex flex-col ${isRightSide ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`px-5 py-3.5 text-base leading-7 ${
                        msg.role === 'user'
                          ? 'rounded-[2rem] bg-[#F4F4F4] text-black dark:bg-[#262626] dark:text-white'
                          : 'bg-transparent px-0 py-0 text-black dark:text-white'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      ) : (
                        <div className="prose prose-base max-w-none break-words text-black dark:prose-invert dark:text-white [&>code]:rounded-md [&>code]:bg-black/5 [&>code]:px-1.5 [&>code]:py-0.5 dark:[&>code]:bg-white/10 [&>p:last-child]:mb-0 [&>p]:mb-4 [&>pre]:rounded-xl [&>pre]:bg-black/5 [&>pre]:p-4 dark:[&>pre]:bg-white/5">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ node, ...props }) => (
                                <div className="my-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                                  <table
                                    className="w-full border-collapse text-left text-black dark:text-white"
                                    {...props}
                                  />
                                </div>
                              ),
                              thead: ({ node, ...props }) => (
                                <thead
                                  className="border-b border-black/10 bg-black/5 text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                                  {...props}
                                />
                              ),
                              th: ({ node, ...props }) => (
                                <th
                                  className="p-3 text-sm font-semibold text-black dark:text-white"
                                  {...props}
                                />
                              ),
                              td: ({ node, ...props }) => (
                                <td
                                  className="border-b border-black/5 p-3 text-sm text-black last:border-0 dark:border-white/5 dark:text-white"
                                  {...props}
                                />
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {msg.timestamp && (
                      <span
                        className={`mt-2 text-[10px] text-black/30 dark:text-white/30 ${isRightSide ? 'mr-2' : 'ml-0'}`}
                      >
                        {msg.timestamp}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 w-full">
        <div className="w-full bg-gradient-to-t from-white via-white to-transparent px-4 pb-6 pt-10 dark:from-[#0A0A0A] dark:via-[#0A0A0A] dark:to-transparent">
          <div className="pointer-events-auto relative mx-auto max-w-4xl">
            {/* Error Alert */}
            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/10">
                <AlertCircle className="mt-0.5 flex-shrink-0 text-red-500" size={18} />
                <div className="text-sm text-red-600 dark:text-red-400">
                  <p className="font-medium">No se pudo enviar el mensaje</p>
                  {/* Error de créditos insuficientes */}
                  {error?.statusCode === 403 ||
                  error?.message?.includes('Insufficient credits') ? (
                    <p className="opacity-90">
                      No tienes créditos suficientes para ejecutar este workflow.{' '}
                      <a
                        href="/billing"
                        className="font-semibold underline underline-offset-2 hover:opacity-75"
                      >
                        Comprar créditos →
                      </a>
                    </p>
                  ) : (
                    <p className="opacity-90">
                      {/* Error de Workflow Pausado (Conflict) o Inactivo (Bad Request) */}
                      {error?.errorCode === 'WORKFLOW_2005' ||
                      error?.message?.includes('paused') ||
                      error?.message?.includes('Conflict') ||
                      error?.errorCode === 'WORKFLOW_2003' ||
                      error?.message?.includes('inactivo') ||
                      error?.message?.includes('Bad Request')
                        ? 'Este workflow ha sido desactivado o pausado y no puede procesar mensajes.'
                        : error?.message || 'Ocurrió un error inesperado.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div
              className={`flex items-end gap-2 rounded-[26px] border border-black/5 bg-[#f4f4f4] p-2 pl-4 shadow-sm transition-shadow focus-within:shadow-md dark:border-white/5 dark:bg-[#212121] ${
                conversationData && !conversationData.userId && !conversationData.isHumanInTheLoop
                  ? 'cursor-not-allowed opacity-50'
                  : ''
              }`}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  conversationData && !conversationData.userId
                    ? conversationData.isHumanInTheLoop
                      ? 'Escribe tu respuesta...'
                      : 'Toma el control para responder manualmente...'
                    : `Envía un mensaje a ${workflow?.name}...`
                }
                className="scrollbar-hide max-h-[200px] min-h-[44px] flex-1 resize-none overflow-y-auto bg-transparent py-3 text-[15px] leading-relaxed text-black outline-none placeholder:text-black/40 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-white/40"
                autoFocus
                disabled={
                  (conversationData &&
                    !conversationData.userId &&
                    !conversationData.isHumanInTheLoop) ||
                  (!!error &&
                    (error?.errorCode === 'WORKFLOW_2005' ||
                      error?.message?.includes('paused') ||
                      error?.message?.includes('Conflict') ||
                      error?.errorCode === 'WORKFLOW_2003' ||
                      error?.message?.includes('inactivo') ||
                      error?.message?.includes('Bad Request')))
                }
              />
              <button
                onClick={handleSend}
                disabled={
                  (conversationData &&
                    !conversationData.userId &&
                    !conversationData.isHumanInTheLoop) ||
                  !input.trim() ||
                  isStreaming ||
                  (!!error &&
                    (error?.errorCode === 'WORKFLOW_2005' ||
                      error?.message?.includes('paused') ||
                      error?.message?.includes('Conflict') ||
                      error?.errorCode === 'WORKFLOW_2003' ||
                      error?.message?.includes('inactivo') ||
                      error?.message?.includes('Bad Request')))
                }
                className="mb-1 mr-1 flex-shrink-0 rounded-full bg-black p-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-20 dark:bg-white dark:text-black"
              >
                {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <div className="mt-2 text-center">
              <p className="text-[10px] text-black/30 dark:text-white/30">
                La IA puede cometer errores. Considera verificar la información importante.
              </p>
            </div>
          </div>
        </div>

        {/* Delete Modal */}
        <Modal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Eliminar conversación"
        >
          <div className="space-y-4">
            <p className="text-black/60 dark:text-white/60">
              ¿Estás seguro de que deseas eliminar esta conversación? Esta acción no se puede
              deshacer.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteConversation.mutate(conversationId, {
                    onSuccess: () => {
                      setIsDeleteOpen(false); // probably unnecessary due to redirect but good practice
                      router.push('/conversations');
                    },
                  });
                }}
                disabled={deleteConversation.isPending}
                className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {deleteConversation.isPending && <Loader2 size={14} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </Modal>
        </div>
      </div>
    </PermissionGuard>
  );
}
