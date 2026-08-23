'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';

interface ContactOptionsMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * "Más opciones" del contacto: renombrar o borrarlo para siempre.
 *
 * Va aparte del botón de bloquear porque no comparte su semántica — bloquear es reversible y
 * frecuente, esto no. Ambas acciones comparten permiso de todos modos (`OWNER`/`ADMIN`), así
 * que el menú entero se oculta para `VIEWER` desde el sitio donde se monta.
 */
export function ContactOptionsMenu({ onEdit, onDelete }: ContactOptionsMenuProps) {
  const t = useTranslations('Contacts');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('moreOptions')}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-primary ${
          isOpen ? 'bg-surface-elevated text-text-primary' : ''
        }`}
      >
        <MoreVertical size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface-panel p-1 shadow-lg"
          >
            <button
              onClick={() => {
                setIsOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
            >
              <Pencil size={14} />
              {t('editAction')}
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-[var(--badge-danger-bg)]"
            >
              <Trash2 size={14} />
              {t('deleteAction')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
