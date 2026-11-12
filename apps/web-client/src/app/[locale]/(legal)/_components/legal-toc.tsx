'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface TocItem {
  id: string;
  label: string;
}

interface LegalTocProps {
  sections: TocItem[];
}

/** Tiempo en que el scroll provocado por un clic no puede cambiar la sección marcada. */
const CLICK_LOCK_MS = 1000;

/** Tolerancia en px: con zoom o escalado el scroll puede quedar a fracciones del final. */
const BOTTOM_TOLERANCE_PX = 4;

function isAtPageBottom() {
  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - BOTTOM_TOLERANCE_PX
  );
}

export default function LegalToc({ sections }: LegalTocProps) {
  const t = useTranslations('LegalToc');
  const [activeId, setActiveId] = useState<string>('');
  const clickLockUntil = useRef(0);

  useEffect(() => {
    const headings = sections
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    const lastId = sections[sections.length - 1]?.id;

    // Las últimas secciones, si son cortas, nunca suben hasta la franja de detección del
    // observer porque la página se acaba antes. Al llegar al final se marca la última.
    const markLastIfAtBottom = () => {
      if (Date.now() < clickLockUntil.current) return false;
      if (lastId && isAtPageBottom()) {
        setActiveId(lastId);
        return true;
      }
      return false;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLockUntil.current) return;
        // El callback del observer llega después del evento de scroll: sin esta revisión
        // pisaría la última sección con la penúltima al tocar fondo.
        if (markLastIfAtBottom()) return;

        // Encuentra la sección más alta que esté intersectando
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Toma la que tenga el top más cercano al viewport superior
          const topmost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          setActiveId(topmost.target.id);
        }
      },
      {
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0,
      },
    );

    headings.forEach((el) => observer.observe(el));
    window.addEventListener('scroll', markLastIfAtBottom, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', markLastIfAtBottom);
    };
  }, [sections]);

  return (
    <aside className="lg:w-56 lg:flex-shrink-0">
      <div className="sticky top-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
          {t('content')}
        </p>
        <nav className="space-y-0.5">
          {sections.map(({ id, label }) => {
            const isActive = activeId === id;
            return (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => {
                  // Marca la sección elegida en cuanto se hace clic; el bloqueo evita que el
                  // scroll hacia ella vaya marcando las secciones intermedias.
                  clickLockUntil.current = Date.now() + CLICK_LOCK_MS;
                  setActiveId(id);
                }}
                className={[
                  'block rounded-md px-3 py-1.5 text-sm transition-all',
                  isActive
                    ? 'bg-[var(--accent)] font-medium text-[var(--text-inverse)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                {label}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
