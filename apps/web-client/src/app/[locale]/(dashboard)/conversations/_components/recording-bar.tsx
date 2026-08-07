'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, X } from 'lucide-react';
import { AudioWaveform } from '@/components/ui/audio-waveform';
import { formatRecordingTime } from '@/hooks/use-audio-recorder';

interface RecordingBarProps {
  analyser: AnalyserNode | null;
  seconds: number;
  /** `true` mientras se cierra el dictado; ya no se graba y no hay nada que cancelar. */
  isProcessing: boolean;
  /** `true` mientras viaja un segmento al servidor, con el micrófono aún abierto. */
  isTranscribingSegment: boolean;
  /** Texto acumulado hasta ahora, para no dictar a ciegas. */
  transcript: string;
  onStop: () => void;
  onCancel: () => void;
}

/**
 * Ocupa el sitio del composer mientras dura el dictado.
 *
 * Sustituye al `textarea` en lugar de acompañarlo: mientras hablas no tiene sentido poder
 * escribir, y dejar el botón de enviar visible invitaría a mandar un mensaje que todavía
 * no está completo.
 */
export default function RecordingBar({
  analyser,
  seconds,
  isProcessing,
  isTranscribingSegment,
  transcript,
  onStop,
  onCancel,
}: RecordingBarProps) {
  const t = useTranslations('Dictation');
  const transcriptRef = useRef<HTMLParagraphElement>(null);

  // El dictado continuo va añadiendo texto por detrás; sin esto, lo último dicho queda
  // fuera de la vista, que es justo lo que interesa comprobar.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [transcript]);

  if (isProcessing) {
    return (
      <div
        className="flex h-11 flex-1 items-center justify-center gap-2 text-text-secondary"
        aria-live="polite"
      >
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm font-medium">{t('transcribing')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      {transcript.trim() && (
        <p
          ref={transcriptRef}
          className="scrollbar-hide max-h-[72px] overflow-y-auto px-1 pt-1 text-[15px] leading-relaxed text-text-secondary md:max-h-[180px]"
          aria-live="polite"
        >
          {transcript}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          title={t('cancelTitle')}
          aria-label={t('cancelTitle')}
          className="flex-shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-danger-500"
        >
          <X size={18} />
        </button>

        <AudioWaveform analyser={analyser} label={t('waveformLabel')} />

        {isTranscribingSegment ? (
          <Loader2
            size={14}
            className="flex-shrink-0 animate-spin text-text-tertiary"
            aria-label={t('transcribing')}
          />
        ) : null}

        <span
          className="min-w-[4ch] flex-shrink-0 text-center font-mono text-xs tabular-nums text-danger-500"
          aria-live="polite"
        >
          {formatRecordingTime(seconds)}
        </span>

        <button
          type="button"
          onClick={onStop}
          title={t('stopTitle')}
          aria-label={t('stopTitle')}
          className="mr-1 flex-shrink-0 rounded-full bg-accent p-2 text-text-inverse transition-opacity hover:opacity-90"
        >
          <Check size={18} />
        </button>
      </div>
    </div>
  );
}
