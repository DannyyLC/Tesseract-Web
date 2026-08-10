import { useState, useEffect } from 'react';

/**
 * Puntos de corte de Tailwind (`sm` y `lg`, que aquí son los del tema por defecto).
 * De mayor a menor: gana el primero que coincida.
 */
const BREAKPOINTS = [
  { query: '(min-width: 1024px)', columns: 3 },
  { query: '(min-width: 640px)', columns: 2 },
] as const;

/**
 * Número de columnas que toca según el ancho de la ventana.
 *
 * Hace falta en JS —no basta con clases de Tailwind— cuando el reparto de los elementos
 * entre columnas lo decide el componente, como en una distribución tipo mampostería.
 * Empieza en 1 y se corrige al montar: el servidor no conoce el ancho de la ventana, y
 * asumir 3 pintaría tres columnas en un móvil durante el primer fotograma.
 */
export function useColumnCount(): number {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const mediaQueries = BREAKPOINTS.map((bp) => window.matchMedia(bp.query));

    const sync = () => {
      const matched = BREAKPOINTS.find((_, i) => mediaQueries[i].matches);
      setColumns(matched?.columns ?? 1);
    };

    sync();
    mediaQueries.forEach((mq) => mq.addEventListener('change', sync));
    return () => mediaQueries.forEach((mq) => mq.removeEventListener('change', sync));
  }, []);

  return columns;
}
