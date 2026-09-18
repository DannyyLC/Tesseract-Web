'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PartyPopper, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { triggerWowConfetti } from '@/lib/confetti';
import { PendingAnnouncementDto } from '@tesseract/types';
import { btnPrimary } from '@/app/[locale]/admin/_styles';

interface AnnouncementModalProps {
  announcement: PendingAnnouncementDto;
  onDismiss: () => void;
  onCtaClick: () => void;
  /** Vista previa desde el formulario de creación: sin llamadas al backend. */
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
 * (createPortal + AnimatePresence + spring) pero con su propio marcado: header + footer
 * fijos, cuerpo con scroll interno propio (para anuncios largos), y mucho más ancho/alto
 * que un modal de confirmación normal — este es el mensaje, no un diálogo de paso.
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

  // Dispara también en vista previa: el operador necesita ver el efecto real para saber
  // qué está enviando, no solo confiar en que "algo de confeti" va a pasar. El guard de
  // `hasFiredConfetti` sigue evitando un segundo disparo en el doble-montaje de Strict Mode.
  useEffect(() => {
    if (announcement.template !== 'CELEBRATION') return;
    if (hasFiredConfetti.current) return;
    hasFiredConfetti.current = true;
    triggerWowConfetti();
  }, [announcement.template]);

  if (!mounted) return null;

  const isCelebration = announcement.template === 'CELEBRATION';
  const { ctaUrl, ctaLabel } = announcement;

  const handleCtaClick = () => {
    if (!preview) onCtaClick();
  };

  // Sin texto de botón puesto por el operador, no hay botón — nada de un fallback genérico
  // que el operador nunca pidió.
  const ctaButton =
    ctaUrl && ctaLabel ? (
      ctaUrl.startsWith('/') ? (
        <Link href={ctaUrl} onClick={handleCtaClick} className={`${btnPrimary} justify-center`}>
          {ctaLabel}
        </Link>
      ) : (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleCtaClick}
          className={`${btnPrimary} justify-center`}
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
        className="bg-overlay fixed inset-0 z-[100] flex items-center justify-center p-3 backdrop-blur-sm sm:p-6"
      >
        {/* Sin handler de clic en el backdrop: un anuncio bloqueante no se cierra por accidente. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 flex h-[min(88vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
        >
          {preview && onPreviewClose && (
            <button
              onClick={onPreviewClose}
              className="absolute right-3 top-3 z-20 rounded-full bg-surface/90 p-1.5 shadow-sm backdrop-blur-sm hover:bg-surface-secondary"
              aria-label="Cerrar vista previa"
            >
              <X size={18} className="text-text-secondary" />
            </button>
          )}

          {/* Header fijo. */}
          <div
            className={`flex shrink-0 items-center justify-center gap-2 py-10 ${
              isCelebration
                ? 'bg-gradient-to-br from-accent/20 via-accent/10 to-transparent'
                : ''
            }`}
          >
            {isCelebration ? (
              <PartyPopper size={40} className="text-accent" />
            ) : (
              <Sparkles size={34} className="text-accent" />
            )}
          </div>

          {/* Cuerpo con scroll interno propio: si el operador pone un anuncio largo, aquí es
              donde se desplaza, sin mover el header ni el footer. */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10">
            <h2 className="mb-4 text-center text-2xl font-bold text-text-primary sm:text-3xl">
              {announcement.title}
            </h2>
            <div className="prose prose-base mx-auto max-w-none pb-8 text-[17px] leading-relaxed text-text-primary [&>p:last-child]:mb-0 [&>p]:mb-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{announcement.message}</ReactMarkdown>
            </div>
          </div>

          {/* Footer fijo. */}
          <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 sm:p-6">
            {ctaButton}
            <button
              onClick={preview ? undefined : onDismiss}
              disabled={preview}
              className="w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-60"
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
