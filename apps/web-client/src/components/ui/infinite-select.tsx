import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
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
}

export function InfiniteSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  className = '',
}: InfiniteSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
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
        <span className={selectedOption ? 'text-text-primary' : 'text-text-secondary truncate'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className="text-text-secondary shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface-elevated py-1 shadow-lg"
          >
            {options.length === 0 && !isLoading ? (
              <div className="px-3 py-2 text-center text-sm text-text-secondary">Sin opciones</div>
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
                  {value === option.value && <Check size={16} className="text-accent shrink-0" />}
                </button>
              ))
            )}
            
            {/* Elemento final para Infinite Scroll */}
            {hasNextPage && (
              <div ref={loadMoreRef} className="py-2 text-center text-xs text-text-secondary">
                {isFetchingNextPage ? 'Cargando más...' : ''}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
