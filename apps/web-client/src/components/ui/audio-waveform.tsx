'use client';

import { useEffect, useRef } from 'react';

/** Barras visibles. Con ~56 el historial cubre unos 2s y se lee como una onda continua. */
const BAR_COUNT = 56;

/**
 * Fracción de altura que conserva una barra en silencio.
 *
 * Sin esto el silencio se ve como un hueco vacío, que parece que la grabación se cortó.
 * Con un mínimo queda una línea de puntos: "te sigo escuchando, no estás diciendo nada".
 */
const MIN_SCALE = 0.08;

/**
 * Cuánto se amplifica el RMS antes de recortar a 1.
 *
 * La voz normal a medio metro del micrófono ronda un RMS de 0.05–0.15; sin ganancia las
 * barras apenas se despegarían del suelo.
 */
const GAIN = 4;

/** ~30 fps. Suficiente para que se vea fluido y la mitad de trabajo que a 60. */
const FRAME_INTERVAL_MS = 33;

interface AudioWaveformProps {
  analyser: AnalyserNode | null;
  className?: string;
  label?: string;
}

/**
 * Ondas de sonido en vivo, al estilo de un dictado.
 *
 * Las barras son un **historial que se desplaza**, no un espectro de frecuencias: cada
 * frame entra una amplitud nueva por la derecha y sale la más antigua por la izquierda.
 * Eso es lo que da la sensación de que el sonido viaja por la caja; un espectro se vería
 * como un ecualizador vibrando en el sitio.
 *
 * No usa estado de React: a 30 fps provocaría treinta reconciliaciones por segundo. Las
 * alturas se escriben directamente sobre los nodos con `transform: scaleY`, que la GPU
 * compone sin recalcular layout.
 */
export const AudioWaveform = ({ analyser, className = '', label }: AudioWaveformProps) => {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  /** Historial de amplitudes; el índice 0 es la barra más antigua (la de la izquierda). */
  const amplitudesRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  useEffect(() => {
    if (!analyser) return;

    const samples = new Uint8Array(analyser.fftSize);
    let frameId = 0;
    let lastFrameAt = 0;

    const paint = (now: number) => {
      frameId = requestAnimationFrame(paint);

      if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
      lastFrameAt = now;

      analyser.getByteTimeDomainData(samples);

      // RMS de la ventana. Las muestras vienen centradas en 128, así que se resta ese
      // punto medio para medir la desviación respecto al silencio.
      let sumOfSquares = 0;
      for (const sample of samples) {
        const deviation = (sample - 128) / 128;
        sumOfSquares += deviation * deviation;
      }
      const rms = Math.sqrt(sumOfSquares / samples.length);
      const amplitude = Math.min(1, rms * GAIN);

      const amplitudes = amplitudesRef.current;
      amplitudes.shift();
      amplitudes.push(amplitude);

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        bar.style.transform = `scaleY(${MIN_SCALE + amplitudes[i] * (1 - MIN_SCALE)})`;
      }
    };

    frameId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  return (
    <div
      className={`flex h-11 flex-1 items-center gap-[3px] overflow-hidden ${className}`}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            barsRef.current[index] = node;
          }}
          className="h-6 min-w-[2px] flex-1 rounded-full bg-accent"
          style={{ transform: `scaleY(${MIN_SCALE})` }}
        />
      ))}
    </div>
  );
};
