'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ChevronDown, Check, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export interface InfiniteSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  className?: string;
  /**
   * Búsqueda por servidor: opcional. Sin `onSearchChange` el panel se comporta exactamente
   * igual que antes (sin input). Con ella, aparece un buscador fijo arriba de las opciones —
   * necesario cuando el listado tiene cientos/miles de filas y llegar por scroll no alcanza.
   */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

/** Alto máximo del panel. También decide hacia qué lado abre cuando no cabe abajo. */
const MAX_PANEL_HEIGHT = 240;

/** Alto mínimo utilizable: por debajo de esto el panel no muestra ni dos opciones. */
const MIN_PANEL_HEIGHT = 120;

/** Separación entre el disparador y el panel. */
const GAP = 4;

export function InfiniteSelect({
  value,
  onChange,
  options,
  placeholder,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  className = '',
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: InfiniteSelectProps) {
  const tShared = useTranslations('Shared.Loader');
  placeholder = placeholder ?? tShared('select');
  searchPlaceholder = searchPlaceholder ?? tShared('search');
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * El panel se dibuja en un portal sobre `<body>`.
   *
   * Dentro del árbol quedaba recortado por el `overflow` de quien lo alojara —dentro de un modal
   * se cortaba contra el borde—, y no hay `z-index` que arregle eso. Al salirse del flujo hay que
   * colocarlo a mano y recolocarlo mientras siga abierto.
   */
  const place = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;

    // Abre hacia abajo salvo que no quepa y arriba haya más espacio.
    const openUp = below < MAX_PANEL_HEIGHT && above > below;
    const maxHeight = Math.min(
      MAX_PANEL_HEIGHT,
      Math.max(openUp ? above : below, MIN_PANEL_HEIGHT),
    );

    setPanel({
      top: openUp ? rect.top - GAP - maxHeight : rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  // El panel no se pinta hasta tener posición (`isOpen && panel`), así que no hace falta
  // `useLayoutEffect` —que además avisa en el render del servidor— para evitar el salto.
  useEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  // Foco automático en el buscador al abrir, para no obligar a un click de más.
  useEffect(() => {
    if (isOpen && onSearchChange) searchInputRef.current?.focus();
  }, [isOpen, onSearchChange]);

  useEffect(() => {
    if (!isOpen) return;

    const reposition = () => place();

    window.addEventListener('resize', reposition);
    // En captura: también interesa el scroll de los contenedores intermedios, como el cuerpo
    // del modal, que no burbujea.
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, place]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      // El panel ya no es descendiente del contenedor: sin comprobarlo aparte, elegir una opción
      // lo desmontaría en el `mousedown` y el `click` nunca llegaría.
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Configurar IntersectionObserver
  useEffect(() => {
    if (!isOpen || !hasNextPage || !fetchNextPage) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) {
        fetchNextPage();
      }
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [isOpen, hasNextPage, fetchNextPage, isFetchingNextPage]);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus"
      >
        <span className={selectedOption ? 'text-text-primary' : 'truncate text-text-secondary'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-text-secondary" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && panel && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                style={{
                  top: panel.top,
                  left: panel.left,
                  width: panel.width,
                  maxHeight: panel.maxHeight,
                }}
                // Por encima del modal, que vive en z-100.
                className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg"
              >
                {onSearchChange && (
                  <div className="relative shrink-0 border-b border-border p-2">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-secondary"
                    />
                    <input
                      ref={searchInputRef}
                      value={searchValue ?? ''}
                      onChange={(e) => onSearchChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={searchPlaceholder}
                      className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-text-primary outline-none focus:border-border-focus"
                    />
                  </div>
                )}
                <div className="overflow-y-auto py-1">
                {options.length === 0 && !isLoading ? (
                  <div className="px-3 py-2 text-center text-sm text-text-secondary">
                    Sin opciones
                  </div>
                ) : (
                  options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary"
                    >
                      <span className="truncate pr-2">{option.label}</span>
                      {value === option.value && (
                        <Check size={16} className="shrink-0 text-accent" />
                      )}
                    </button>
                  ))
                )}

                {/* Elemento final para Infinite Scroll */}
                {hasNextPage && (
                  <div ref={loadMoreRef} className="py-2 text-center text-xs text-text-secondary">
                    {isFetchingNextPage ? tShared('loadingMore') : ''}
                  </div>
                )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
