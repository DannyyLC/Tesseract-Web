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

  const whatsappOption = (
    <>
      <Phone size={14} className="shrink-0" style={{ color: 'var(--brand-whatsapp)' }} />
      {t('addContactWhatsapp')}
    </>
  );

  // El menú se lee como el mismo botón que se despliega hacia abajo: mismo color, mismo ancho
  // y pegado a él. Al abrir, la píldora pierde el redondeo de abajo y el menú lo continúa.
  return (
    <div className="relative inline-grid shrink-0" ref={containerRef}>
      <button
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={`flex items-center justify-center gap-1.5 bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-[border-radius,background-color] duration-150 hover:bg-accent-hover ${
          isOpen ? 'rounded-t-[18px]' : 'rounded-[18px]'
        }`}
      >
        <Plus size={15} />
        {t('addContact')}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Copia invisible de la opción, en el flujo del grid: así la columna mide lo que el más
          ancho de los dos (botón u opción) y el menú, que es absoluto, nunca queda más ancho
          ni más angosto que el botón, en ningún idioma. */}
      <div
        aria-hidden
        className="invisible flex h-0 items-center gap-2.5 overflow-hidden whitespace-nowrap px-4 text-sm font-medium"
      >
        {whatsappOption}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-0 top-full z-50 overflow-hidden rounded-b-[18px] border-t border-[color-mix(in_srgb,var(--text-inverse)_12%,transparent)] bg-accent shadow-lg"
          >
            <button
              onClick={() => {
                setIsOpen(false);
                onSelectWhatsapp();
              }}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-4 py-2.5 text-left text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
            >
              {whatsappOption}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
