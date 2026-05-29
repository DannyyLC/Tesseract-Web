'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  label: string;
}

interface LegalTocProps {
  sections: TocItem[];
}

export default function LegalToc({ sections }: LegalTocProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const headings = sections
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
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
    return () => observer.disconnect();
  }, [sections]);

  return (
    <aside className="lg:w-56 lg:flex-shrink-0">
      <div className="sticky top-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
          Contenido
        </p>
        <nav className="space-y-0.5">
          {sections.map(({ id, label }) => {
            const isActive = activeId === id;
            return (
              <a
                key={id}
                href={`#${id}`}
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
