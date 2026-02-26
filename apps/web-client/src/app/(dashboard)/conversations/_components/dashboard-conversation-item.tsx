'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  User,
  Calendar,
  Globe,
  Smartphone,
  Terminal,
  Trash2,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DashboardConversationDto } from '@tesseract/types';
import { useConversationMutations } from '@/hooks/useConversations';
import { Modal } from '@/components/ui/modal';

interface DashboardConversationItemProps {
  conversation: DashboardConversationDto;
}

const formatTimeAgo = (date: Date | string): string => {
  if (!date) return 'Desconocido';
  try {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
  } catch (e) {
    return 'Fecha inválida';
  }
};

const getChannelIcon = (channel: string) => {
  if (!channel) return <Terminal size={12} />;

  switch (channel.toLowerCase()) {
    case 'whatsapp':
      return <Smartphone size={12} />;
    case 'web':
    case 'chat':
      return <Globe size={12} />;
    default:
      return <MessageSquare size={12} />;
  }
};

const getStatusConfig = (status: string, isHITL: boolean) => {
  if (isHITL)
    return {
      label: 'Intervenido',
      color: 'bg-orange-500',
      textColor: 'text-orange-500',
      bg: 'bg-orange-500/10',
    };

  switch (status.toLowerCase()) {
    case 'closed':
      return {
        label: 'Cerrado',
        color: 'bg-zinc-400',
        textColor: 'text-zinc-400',
        bg: 'bg-zinc-400/10',
      };
    case 'active':
    case 'open':
      return {
        label: 'Activo',
        color: 'bg-emerald-500',
        textColor: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
      };
    default:
      return {
        label: status,
        color: 'bg-blue-500',
        textColor: 'text-blue-500',
        bg: 'bg-blue-500/10',
      };
  }
};

export default function DashboardConversationItem({
  conversation,
}: DashboardConversationItemProps) {
  const { updateConversation, deleteConversation } = useConversationMutations();
  const statusConfig = getStatusConfig(conversation.status, conversation.isHumanInTheLoop);

  const [isEditing, setIsEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title || '');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleRename = () => {
    if (renameValue.trim() && renameValue.trim() !== conversation.title) {
      updateConversation.mutate(
        { id: conversation.id, data: { title: renameValue } },
        {
          onSuccess: () => setIsEditing(false),
        }
      );
    } else {
      setRenameValue(conversation.title || '');
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      setRenameValue(conversation.title || '');
      setIsEditing(false);
    }
  };

  return (
    <>
      <Link href={`/conversations/${conversation.id}`} className="group block px-2">
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-transparent bg-transparent transition-all duration-200 hover:border-black/5 hover:bg-white hover:shadow-sm dark:hover:border-white/5 dark:hover:bg-[#141414]"
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {/* Header: User/Title + Date */}
                <div className="mb-1 flex items-center gap-3">
                  <div className="rounded-full bg-black/5 p-1.5 text-black/60 dark:bg-white/5 dark:text-white/60">
                    <User size={14} />
                  </div>

                  {isEditing ? (
                    <div className="mr-4 flex-1" onClick={(e) => e.preventDefault()}>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleRename}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="border-primary w-full border-b-2 bg-transparent p-0 text-lg font-semibold text-black outline-none focus:ring-0 dark:text-white"
                      />
                    </div>
                  ) : (
                    <h3
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenameValue(conversation.title || '');
                        setIsEditing(true);
                      }}
                      className="cursor-pointer truncate text-base font-semibold text-black transition-colors hover:opacity-70 dark:text-white"
                      title="Click para editar nombre"
                    >
                      {conversation.title || 'Conversación sin título'}
                    </h3>
                  )}

                  {/* Minimal Status Dot */}
                  <div className="flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${statusConfig.color.replace('text-', 'bg-')}`}
                    />
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide ${statusConfig.textColor}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="mb-3 flex items-center gap-3 pl-8 text-sm text-black/50 dark:text-white/50">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`rounded-full p-1 ${conversation.channel === 'whatsapp' ? 'bg-green-500/10 text-green-600' : 'bg-blue-500/10 text-blue-600'}`}
                    >
                      {getChannelIcon(conversation.channel)}
                    </div>
                    <span className="text-xs font-medium capitalize">{conversation.channel}</span>
                  </div>
                  <span className="text-black/20 dark:text-white/20">•</span>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} />
                    <span className="text-xs">{formatTimeAgo(conversation.lastMessageAt)}</span>
                  </div>
                </div>
              </div>

              {/* Actions (always visible) */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDeleteOpen(true);
                  }}
                  className="rounded-full p-2 text-black/30 opacity-0 transition-colors hover:bg-black/5 hover:text-red-500 group-hover:opacity-100 dark:text-white/30 dark:hover:bg-white/5"
                  title="Eliminar"
                >
                  {deleteConversation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Footer Info */}
            <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
              <div className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40">
                <MessageSquare size={12} />
                <span>{conversation.messageCount} mensajes</span>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>

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
              className="rounded-xl px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                deleteConversation.mutate(conversation.id, {
                  onSuccess: () => setIsDeleteOpen(false),
                });
              }}
              disabled={deleteConversation.isPending}
              className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
            >
              {deleteConversation.isPending && <Loader2 size={14} className="animate-spin" />}
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
