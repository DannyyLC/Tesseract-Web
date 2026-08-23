'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Phone, Plus } from 'lucide-react';

interface AddContactMenuProps {
  /** Por ahora el único canal por el que se puede dar de alta un contacto a mano. */
  onSelectWhatsapp: () => void;
}

/**
 * Menú para dar de alta un contacto a mano.
 *
 * Solo trae la opción de WhatsApp: es el único canal identificable con un solo dato (el
 * número). Messenger depende de un PSID que entrega Meta al primer mensaje, así que no hay
 * nada que teclear para darlo de alta desde aquí.
 */
export function AddContactMenu({ onSelectWhatsapp }: AddContactMenuProps) {
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
        className={`flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 ${
          isOpen ? 'ring-2 ring-border' : ''
        }`}
      >
        <Plus size={15} />
        {t('addContact')}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface-panel p-1 shadow-lg"
          >
            <button
              onClick={() => {
                setIsOpen(false);
                onSelectWhatsapp();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
            >
              <Phone size={14} style={{ color: 'var(--brand-whatsapp)' }} />
              {t('addContactWhatsapp')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
