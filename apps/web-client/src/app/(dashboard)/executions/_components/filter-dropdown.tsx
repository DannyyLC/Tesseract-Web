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
        className={`flex w-full items-center justify-between rounded-full bg-black/5 px-4 py-2 text-sm transition-all duration-200 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 ${
          isOpen ? 'ring-2 ring-black/5 dark:ring-white/5' : ''
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
            {label}
          </span>
          <div className="mx-1 h-3 w-[1px] bg-black/10 dark:bg-white/10" />
          <span
            className={`truncate font-medium ${selectedOption ? 'text-black dark:text-white' : 'text-black/50 dark:text-white/50'}`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-2 pl-2">
          {value && (
            <div
              role="button"
              onClick={clearSelection}
              className="rounded-full p-0.5 text-black/40 transition-colors hover:bg-black/10 dark:text-white/40 dark:hover:bg-white/10"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown
            size={14}
            className={`text-black/30 transition-transform duration-200 dark:text-white/30 ${isOpen ? 'rotate-180' : ''}`}
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
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg dark:border-white/5 dark:bg-[#141414]"
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
                          ? 'bg-black/5 font-medium text-black dark:bg-white/5 dark:text-white'
                          : 'text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate pr-2">{option.label}</span>
                      {value === option.value && (
                        <Check size={14} className="shrink-0 text-black dark:text-white" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-xs text-black/40 dark:text-white/40">
                  No hay opciones disponibles
                </div>
              )}
              {isLoadingMore && (
                <div className="flex justify-center p-2">
                  <Loader2 className="animate-spin text-black/20 dark:text-white/20" size={16} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
