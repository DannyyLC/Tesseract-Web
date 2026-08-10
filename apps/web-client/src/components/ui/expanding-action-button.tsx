'use client';

import { ReactNode } from 'react';
import { Link } from '@/i18n/routing';

interface ExpandingActionButtonProps {
  icon: ReactNode;
  label: string;
  /** Renderiza un enlace en vez de un botón. */
  href?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Acción que en pantallas anchas se muestra solo con el icono y despliega su etiqueta al
 * pasar el ratón, para que quepan varias en una fila sin comerse el ancho.
 *
 * El ancho de un elemento no se puede animar desde `auto`, así que no se anima el botón:
 * se anima `grid-template-columns` de `0fr` a `1fr` sobre el envoltorio del texto, que va
 * con `overflow-hidden`. El texto pasa de ocupar cero a su ancho natural sin números mágicos.
 *
 * Solo colapsa desde `xl`: por debajo la fila se apila con botones a ancho completo, ahí
 * sobra sitio y además no existe el hover. La etiqueta siempre es el nombre accesible.
 */
export function ExpandingActionButton({
  icon,
  label,
  href,
  onClick,
  className = '',
}: ExpandingActionButtonProps) {
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-text-secondary transition-colors group-hover:bg-surface-secondary">
        {icon}
      </span>
      <span className="grid grid-cols-[1fr] transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none xl:grid-cols-[0fr] xl:group-hover:grid-cols-[1fr] xl:group-focus-visible:grid-cols-[1fr]">
        <span className="overflow-hidden whitespace-nowrap">{label}</span>
      </span>
    </>
  );

  // La separación entre icono y texto es `gap`, y colapsa a cero con el texto. No sirve
  // ponerla como padding del hijo recortado: con `box-sizing: border-box` una caja nunca
  // mide menos que su propio padding, así que reaparecerían esos píxeles a la derecha del
  // icono y lo dejarían descentrado. Colapsado queda 8px + icono de 28px + 8px = 44px,
  // el mismo alto que `h-11`: un círculo exacto.
  const classes = `group flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-surface-elevated pl-2 pr-5 text-sm font-medium text-text-primary transition-all duration-200 hover:bg-[var(--surface-tint)] active:scale-95 motion-reduce:transition-none xl:w-auto xl:gap-0 xl:pr-2 xl:hover:gap-2.5 xl:hover:pr-5 xl:focus-visible:gap-2.5 xl:focus-visible:pr-5 ${className}`;

  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className={classes}>
      {content}
    </button>
  );
}
