'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import RootApi from '@/lib/api/endpoints/root-api';
import { useAudioRecorder } from './use-audio-recorder';

/**
 * Silencio que cierra un segmento.
 *
 * 2,5 s deja pensar a media frase sin cortar una idea por la mitad. Por debajo de ~1 s se
 * trocea el habla normal; por encima de ~4 s el texto tarda tanto en aparecer que parece
 * que no funciona.
 */
const SILENCE_MS = 2500;

/**
 * Tope duro de un segmento.
 *
 * El corte por silencio no llega nunca en una cafetería o con música de fondo, así que
 * hace falta un límite que no dependa del entorno. 60 s mantienen cada transcripción
 * rápida y acotan lo que se pierde si una falla.
 */
const MAX_SEGMENT_MS = 60000;

/**
 * RMS por debajo del cual consideramos que nadie está hablando.
 *
 * Una sala tranquila ronda 0,005–0,02; la voz a medio metro, 0,05–0,2. El umbral queda
 * justo encima del ruido ambiente típico.
 */
const SILENCE_RMS = 0.02;

/** Cada cuánto se mira el nivel. 100 ms basta para el silencio y no compite con las ondas. */
const MONITOR_INTERVAL_MS = 100;

/**
 * Dictado continuo: graba, corta por sí solo y va concatenando texto.
 *
 * Mientras hablas se van cerrando segmentos —por silencio o por tope— que se transcriben
 * en segundo plano y se añaden al composer, sin que el micrófono deje de escuchar. Sigues
 * hablando y el texto sigue creciendo hasta que confirmas.
 */
export function useDictation(onTranscribed: (text: string) => void) {
  const t = useTranslations('Dictation');
  const { state, seconds, analyser, start, stop, cutSegment, cancel, reset } = useAudioRecorder();

  /** Hay un segmento viajando al servidor; sirve para avisar en la interfaz. */
  const [isTranscribingSegment, setIsTranscribingSegment] = useState(false);

  /**
   * Encadena las transcripciones.
   *
   * Los segmentos salen en orden pero pueden volver desordenados: uno corto responde antes
   * que uno largo lanzado previamente. Sin esta cadena, el texto se concatenaría al revés.
   */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const segmentStartedAtRef = useRef(0);
  const lastLoudAtRef = useRef(0);
  /** Sin voz detectada aún no se corta: evita transcribir silencio y pagar por nada. */
  const hasSpokenRef = useRef(false);
  const isCuttingRef = useRef(false);
  const onTranscribedRef = useRef(onTranscribed);

  // La interfaz recrea el callback en cada render; guardarlo en una ref evita reiniciar
  // el monitor de silencio a media grabación.
  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  const resetSegmentTimers = useCallback(() => {
    const now = Date.now();
    segmentStartedAtRef.current = now;
    lastLoudAtRef.current = now;
    hasSpokenRef.current = false;
  }, []);

  /** Sube un segmento y añade su texto al final de lo que ya haya. */
  const enqueueTranscription = useCallback(
    (blob: Blob | null) => {
      if (!blob || blob.size === 0) return;

      setIsTranscribingSegment(true);
      queueRef.current = queueRef.current
        .then(async () => {
          try {
            const api = RootApi.getInstance().getConversationsApi();
            const text = await api.transcribe(blob);
            if (text.trim()) {
              onTranscribedRef.current(text);
            }
          } catch (error: any) {
            // Un segmento fallido no debe tumbar el dictado: se avisa y se sigue oyendo.
            toast.error(error?.message || t('transcriptionFailed'));
          }
        })
        .finally(() => setIsTranscribingSegment(false));
    },
    [t],
  );

  const startDictation = useCallback(async () => {
    const started = await start();
    if (!started) {
      toast.error(t('micUnavailable'));
      return;
    }
    resetSegmentTimers();
  }, [start, resetSegmentTimers, t]);

  // Vigila el nivel para cerrar segmentos por silencio o por tope.
  useEffect(() => {
    if (state !== 'recording' || !analyser) return;

    const samples = new Uint8Array(analyser.fftSize);

    const monitor = setInterval(() => {
      if (isCuttingRef.current) return;

      analyser.getByteTimeDomainData(samples);
      let sumOfSquares = 0;
      for (const sample of samples) {
        const deviation = (sample - 128) / 128;
        sumOfSquares += deviation * deviation;
      }
      const rms = Math.sqrt(sumOfSquares / samples.length);

      const now = Date.now();
      if (rms > SILENCE_RMS) {
        hasSpokenRef.current = true;
        lastLoudAtRef.current = now;
      }

      const silentFor = now - lastLoudAtRef.current;
      const elapsed = now - segmentStartedAtRef.current;
      const shouldCut =
        (hasSpokenRef.current && silentFor >= SILENCE_MS) || elapsed >= MAX_SEGMENT_MS;

      if (!shouldCut) return;

      // Si no llegó a hablar, el tope vence igualmente pero no hay nada que transcribir:
      // se reinicia la ventana y se sigue escuchando.
      if (!hasSpokenRef.current) {
        resetSegmentTimers();
        return;
      }

      isCuttingRef.current = true;
      void cutSegment()
        .then((blob) => enqueueTranscription(blob))
        .finally(() => {
          resetSegmentTimers();
          isCuttingRef.current = false;
        });
    }, MONITOR_INTERVAL_MS);

    return () => clearInterval(monitor);
  }, [state, analyser, cutSegment, enqueueTranscription, resetSegmentTimers]);

  /** Cierra el dictado: transcribe lo que quede pendiente y suelta el micrófono. */
  const stopDictation = useCallback(async () => {
    const blob = await stop();

    try {
      // Solo se sube el último tramo si llegó a haber voz; si el usuario confirma justo
      // después de un corte automático, ese resto es silencio.
      if (hasSpokenRef.current) {
        enqueueTranscription(blob);
      }
      await queueRef.current;
    } finally {
      // El `reset()` va aquí y no en cada rama: sin él, cualquier salida temprana dejaba
      // la interfaz clavada en "Transcribiendo…".
      reset();
    }
  }, [stop, enqueueTranscription, reset]);

  const cancelDictation = useCallback(() => {
    hasSpokenRef.current = false;
    cancel();
  }, [cancel]);

  return {
    state,
    seconds,
    analyser,
    isActive: state !== 'idle',
    isTranscribingSegment,
    start: startDictation,
    stop: stopDictation,
    cancel: cancelDictation,
  };
}
