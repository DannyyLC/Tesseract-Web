'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Formatos que pedimos a MediaRecorder, en orden de preferencia.
 *
 * Opus en WebM es lo que dan Chrome y Firefox y es lo que mejor comprime para voz.
 * Safari no lo soporta y solo graba en MP4. Si ninguno encaja se deja que el
 * navegador elija (cadena vacía), que es preferible a fallar.
 */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/**
 * Tasa de bits del audio grabado.
 *
 * No es cosmético: el servidor no mide segundos, mide bytes, y convierte su límite de
 * duración asumiendo 32 kbps (`ASSUMED_AUDIO_BITRATE_KBPS` en `media-policy.ts`, calibrado
 * para las notas de voz de WhatsApp). Si dejamos que el navegador elija su tasa por
 * defecto —más alta y distinta en cada uno—, el límite real se acorta sin avisar y el
 * rechazo llega cuando el usuario ya habló y pierde lo dicho.
 *
 * Fijándola aquí, cliente y servidor cuentan lo mismo. Opus mono a 32 kbps es de sobra
 * para voz; es lo que usa WhatsApp.
 */
const AUDIO_BITS_PER_SECOND = 32000;

export type RecorderState = 'idle' | 'recording' | 'processing';

export interface AudioRecorderError {
  /** `denied` distingue "el usuario dijo que no" de "aquí no hay micrófono". */
  kind: 'denied' | 'unavailable' | 'failed';
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

/**
 * Graba audio del micrófono y lo entrega como Blob.
 *
 * No transcribe ni sube nada: solo produce el audio y gestiona el ciclo de vida del
 * micrófono. Quien lo use decide qué hacer con el Blob.
 *
 * Suelta las pistas del `MediaStream` en cuanto termina la grabación —también al
 * cancelar y al desmontar—, porque si no el navegador deja el indicador de "grabando"
 * encendido y el usuario cree que le seguimos escuchando.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<AudioRecorderError | null>(null);
  /**
   * Se expone como estado —y no como ref— para que el visualizador se monte en cuanto
   * hay algo que analizar; una ref no dispararía el render.
   */
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Se resuelve cuando el recorder emite `stop`; así `stop()` puede devolver el Blob. */
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // El AudioContext se cierra aquí, junto a las pistas: parar, cancelar y desmontar
    // pasan todos por este punto, así que no hay que acordarse en tres sitios.
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setAnalyser(null);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Si el componente se desmonta a media grabación, el micrófono debe soltarse igual.
  useEffect(() => releaseMicrophone, [releaseMicrophone]);

  /**
   * Arranca un `MediaRecorder` nuevo sobre un stream ya abierto.
   *
   * Está separado de `start()` porque el dictado continuo corta en segmentos: cada corte
   * cierra un recorder y abre otro **sobre el mismo stream**. Volver a pedir
   * `getUserMedia` reabriría el micrófono, parpadearía el indicador del navegador y
   * cortaría las ondas.
   */
  const attachRecorder = useCallback((stream: MediaStream) => {
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        : null;
      chunksRef.current = [];
      stopResolverRef.current?.(blob);
      stopResolverRef.current = null;
    };

    recorder.start();
  }, []);

  /** Cierra el recorder actual y devuelve su audio, sin tocar el stream. */
  const closeRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return null;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });

    recorderRef.current = null;
    return blob;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError({ kind: 'unavailable' });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Rama de análisis, en paralelo a la grabación: alimenta la visualización de
      // ondas y no interviene en el audio que se acaba enviando.
      try {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyserNode = audioContext.createAnalyser();
        // 1024 muestras dan una ventana de ~21 ms a 48 kHz: suficiente para un RMS
        // estable sin retrasar la reacción de las barras.
        analyserNode.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyserNode);
        setAnalyser(analyserNode);
      } catch {
        // Sin visualización se puede dictar igual; no merece abortar la grabación.
        audioContextRef.current = null;
        setAnalyser(null);
      }

      attachRecorder(stream);
      setSeconds(0);
      setState('recording');
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
      return true;
    } catch (cause) {
      releaseMicrophone();
      // NotAllowedError es el rechazo explícito del permiso; el resto son fallos de
      // hardware o de contexto inseguro (http sin localhost).
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      setError({ kind: denied ? 'denied' : 'failed' });
      setState('idle');
      return false;
    }
  }, [releaseMicrophone]);

  /**
   * Cierra el segmento en curso y abre otro de inmediato, sin soltar el micrófono.
   *
   * Es la pieza del dictado continuo: el usuario no percibe el corte porque el stream, el
   * contador y las ondas siguen vivos; solo cambia el `MediaRecorder` que hay debajo.
   */
  const cutSegment = useCallback(async (): Promise<Blob | null> => {
    const stream = streamRef.current;
    const blob = await closeRecorder();

    if (stream?.active) {
      attachRecorder(stream);
    }

    return blob;
  }, [closeRecorder, attachRecorder]);

  /** Cierra la grabación y devuelve el audio. `null` si no se capturó nada. */
  const stop = useCallback(async (): Promise<Blob | null> => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      releaseMicrophone();
      setState('idle');
      return null;
    }

    setState('processing');
    const blob = await closeRecorder();
    releaseMicrophone();
    return blob;
  }, [closeRecorder, releaseMicrophone]);

  /** Descarta la grabación en curso sin producir audio. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    // Se desarma el `onstop` para que no resuelva con un Blob que nadie espera.
    stopResolverRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    recorderRef.current = null;
    releaseMicrophone();
    setSeconds(0);
    setState('idle');
  }, [releaseMicrophone]);

  const reset = useCallback(() => {
    setState('idle');
    setSeconds(0);
  }, []);

  return { state, seconds, error, analyser, start, stop, cutSegment, cancel, reset };
}

/** `95` -> `1:35`. */
export function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
