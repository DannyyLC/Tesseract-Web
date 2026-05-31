import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X, Loader2 } from 'lucide-react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onReachEnd?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

export default function FilterDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  className = '',
  onReachEnd,
  isLoadingMore = false,
  hasMore = false,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Observer for infinite scroll
  const lastOptionRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (isLoadingMore) return;

      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && onReachEnd) {
          onReachEnd();
        }
      });

      if (node) observer.observe(node);
      return () => {
        if (node) observer.unobserve(node);
        observer.disconnect();
      };
    },
    [isLoadingMore, hasMore, onReachEnd],
  );

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between rounded-full bg-[var(--surface-tint)] px-4 py-2 text-sm transition-all duration-200 hover:bg-[var(--surface-tint-md)] ${
          isOpen ? 'ring-2 ring-[var(--border-subtle)]' : ''
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {label}
          </span>
          <div className="mx-1 h-3 w-[1px] bg-surface-secondary" />
          <span
            className={`truncate font-medium ${selectedOption ? 'text-text-primary' : 'text-text-secondary'}`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-2 pl-2">
          {value && (
            <div
              role="button"
              onClick={clearSelection}
              className="rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-[var(--surface-tint-md)]"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown
            size={14}
            className={`text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-surface-elevated shadow-lg"
          >
            <div className="max-h-60 overflow-y-auto overflow-x-hidden p-1">
              {options.length > 0 ? (
                options.map((option, index) => {
                  const isLast = index === options.length - 1;
                  return (
                    <button
                      ref={isLast ? lastOptionRef : null}
                      key={option.value}
                      onClick={() => handleSelect(option.value)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        value === option.value
                          ? 'bg-[var(--surface-tint)] font-medium text-text-primary'
                          : 'text-text-secondary hover:bg-[var(--surface-tint)]'
                      }`}
                    >
                      <span className="truncate pr-2">{option.label}</span>
                      {value === option.value && (
                        <Check size={14} className="shrink-0 text-text-primary" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                  No hay opciones disponibles
                </div>
              )}
              {isLoadingMore && (
                <div className="flex justify-center p-2">
                  <Loader2 className="animate-spin text-text-tertiary" size={16} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
