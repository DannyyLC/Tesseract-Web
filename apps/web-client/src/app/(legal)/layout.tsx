'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';

const navLinks = [
  { href: '/terms', label: 'Términos y Condiciones' },
  { href: '/policies', label: 'Políticas' },
  { href: '/privacy', label: 'Privacidad de Datos' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {/* Brand */}
          <button onClick={() => router.back()} className="group flex items-center gap-2.5" aria-label="Volver atrás">
            <div className="relative h-8 w-8 flex-shrink-0 transition-opacity group-hover:opacity-70">
              <Image
                src="/favicon.svg"
                alt="Tesseract"
                fill
                className="object-contain brightness-0 dark:invert"
                priority
              />
            </div>
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)] transition-opacity group-hover:opacity-70">
              Tesseract
            </span>
            <span className="hidden text-[var(--text-tertiary)] sm:inline">/ Legal</span>
          </button>

          {/* Legal section nav */}
          <nav className="flex items-center gap-1" aria-label="Documentos legales">
            {navLinks.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="mt-24 border-t border-[var(--border)] pb-12 pt-8 text-center text-sm text-[var(--text-tertiary)]">
        <p>© {new Date().getFullYear()} Fractal. Todos los derechos reservados.</p>
        <p className="mt-1">Jurisdicción: Aguascalientes, México · Ley aplicable: legislación mexicana</p>
      </footer>
    </div>
  );
}
