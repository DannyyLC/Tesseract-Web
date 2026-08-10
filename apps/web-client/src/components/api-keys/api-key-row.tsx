'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Edit2, Key, Trash2, Workflow } from 'lucide-react';
import { ApiKeyListDto } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';

interface ApiKeyRowProps {
  apiKey: ApiKeyListDto;
  /** Escalona la animación de entrada dentro de una lista. */
  index?: number;
  /**
   * Dentro del detalle de un workflow el nombre del workflow es redundante:
   * todas las keys de la lista son suyas.
   */
  showWorkflow?: boolean;
  onEdit: (apiKey: ApiKeyListDto) => void;
  onDelete: (apiKey: ApiKeyListDto) => void;
}

/**
 * Fila de una API Key. Compartida por la página global de API Keys y por la sección
 * del detalle del workflow, para que las dos se comporten igual.
 */
export function ApiKeyRow({
  apiKey,
  index = 0,
  showWorkflow = true,
  onEdit,
  onDelete,
}: ApiKeyRowProps) {
  const t = useTranslations('ApiKeys');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05 }}
      className={`group flex flex-col gap-4 rounded-xl border border-transparent bg-transparent p-4 transition-all duration-200 hover:border-border hover:bg-surface-panel hover:shadow-sm md:flex-row md:items-start ${!apiKey.isActive ? 'opacity-60' : ''}`}
    >
      <div
        className={`flex-shrink-0 rounded-lg p-2 ${apiKey.isActive ? 'bg-surface-secondary text-text-secondary' : 'bg-surface-secondary text-text-tertiary'}`}
      >
        <Key size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-3">
          <h3
            className={`truncate text-base font-semibold ${apiKey.isActive ? 'text-text-primary' : 'text-text-tertiary line-through'}`}
          >
            {apiKey.name}
          </h3>

          <div className="flex items-center gap-1.5 rounded-full bg-surface-secondary px-2 py-0.5">
            <div
              className={`h-1.5 w-1.5 rounded-full ${apiKey.isActive ? 'bg-success-500' : 'bg-neutral-400'}`}
            />
            <span
              className={`text-[10px] font-medium uppercase tracking-wide ${apiKey.isActive ? 'text-success-600' : 'text-neutral-500'}`}
            >
              {apiKey.isActive ? t('statusActive') : t('statusInactive')}
            </span>
          </div>
        </div>

        {apiKey.description && (
          <p className="mb-2 line-clamp-1 text-sm text-text-secondary">{apiKey.description}</p>
        )}

        {showWorkflow && (
          <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
            <Workflow size={12} />
            <span className="truncate font-medium">{apiKey.workflowName}</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1 self-start opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:mt-0 md:self-center">
        <PermissionGuard permissions="api_keys:update">
          <button
            onClick={() => onEdit(apiKey)}
            className="rounded-full p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
            title={t('editTitle')}
          >
            <Edit2 size={16} />
          </button>
        </PermissionGuard>

        <PermissionGuard permissions="api_keys:delete">
          <button
            onClick={() => onDelete(apiKey)}
            className="hover:bg-danger/10 rounded-full p-2 text-text-tertiary transition-colors hover:text-danger"
            title={t('deleteTitle')}
          >
            <Trash2 size={16} />
          </button>
        </PermissionGuard>
      </div>
    </motion.div>
  );
}
