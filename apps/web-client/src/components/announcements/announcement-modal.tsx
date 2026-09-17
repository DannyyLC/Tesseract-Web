'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { PartyPopper, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { triggerWowConfetti } from '@/lib/confetti';
import { PendingAnnouncementDto } from '@tesseract/types';
import { btnPrimary } from '@/app/[locale]/admin/_styles';

interface AnnouncementModalProps {
  announcement: PendingAnnouncementDto;
  onDismiss: () => void;
  onCtaClick: () => void;
  /** Vista previa desde el formulario de creación: sin confetti, sin llamadas al backend. */
  preview?: boolean;
  /** Solo con `preview`: el real nunca se cierra con una X, la vista previa sí. */
  onPreviewClose?: () => void;
}

/**
 * Modal a pantalla completa y bloqueante para anuncios del super admin.
 *
 * A propósito NO reutiliza `components/ui/modal.tsx`: ese componente siempre pinta una
 * barra de título con X y cierra al hacer clic en el backdrop — justo lo que un mensaje
 * de una sola vez no debe permitir. Se reutiliza la misma receta de animación
 * (createPortal + AnimatePresence + spring) pero con su propio marcado.
 */
export function AnnouncementModal({
  announcement,
  onDismiss,
  onCtaClick,
  preview = false,
  onPreviewClose,
}: AnnouncementModalProps) {
  const t = useTranslations('Announcements');
  const [mounted, setMounted] = useState(false);
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    if (preview) return;
    if (announcement.template !== 'CELEBRATION') return;
    if (hasFiredConfetti.current) return;
    hasFiredConfetti.current = true;
    triggerWowConfetti();
  }, [announcement.template, preview]);

  if (!mounted) return null;

  const isCelebration = announcement.template === 'CELEBRATION';
  const ctaUrl = announcement.ctaUrl;
  const ctaLabel = announcement.ctaLabel || t('ctaFallbackLabel');

  const handleCtaClick = () => {
    if (!preview) onCtaClick();
  };

  const ctaButton = ctaUrl ? (
    ctaUrl.startsWith('/') ? (
      <Link href={ctaUrl} onClick={handleCtaClick} className={btnPrimary}>
        {ctaLabel}
      </Link>
    ) : (
      <a
        href={ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleCtaClick}
        className={btnPrimary}
      >
        {ctaLabel}
      </a>
    )
  ) : null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      >
        {/* Sin handler de clic en el backdrop: un anuncio bloqueante no se cierra por accidente. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
        >
          {preview && onPreviewClose && (
            <button
              onClick={onPreviewClose}
              className="absolute right-3 top-3 z-20 rounded-lg bg-surface/80 p-1 backdrop-blur-sm hover:bg-surface-secondary"
              aria-label="Cerrar vista previa"
            >
              <X size={18} className="text-text-secondary" />
            </button>
          )}
          <div
            className={`flex items-center justify-center gap-2 px-6 py-8 text-center ${
              isCelebration
                ? 'bg-gradient-to-br from-accent/20 via-accent/10 to-transparent'
                : ''
            }`}
          >
            {isCelebration ? (
              <PartyPopper size={28} className="text-accent" />
            ) : (
              <Sparkles size={24} className="text-accent" />
            )}
          </div>

          <div className="space-y-3 px-6 pb-6">
            <h2 className="text-center text-lg font-semibold text-text-primary">
              {announcement.title}
            </h2>
            <p className="whitespace-pre-line text-center text-sm text-text-secondary">
              {announcement.message}
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-border p-4">
            {ctaButton}
            <button
              onClick={preview ? undefined : onDismiss}
              disabled={preview}
              className="w-full rounded-lg px-4 py-2 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-60"
            >
              {t('dismiss')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
