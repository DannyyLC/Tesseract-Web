'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const t = useTranslations('LocaleSwitcher');
  const [mounted, setMounted] = React.useState(false);
  const [, startTransition] = useTransition();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-[4.5rem] animate-pulse rounded-lg bg-surface-secondary" />;
  }

  function switchLocale(next: 'es' | 'en') {
    localStorage.setItem('NEXT_LOCALE', next);
    startTransition(() => {
      router.replace(
        // @ts-expect-error — pathname + params son válidos en runtime
        { pathname, params },
        { locale: next },
      );
    });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-secondary p-0.5">
      {(['es', 'en'] as const).map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={[
            'min-w-[2rem] rounded-md px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-150',
            locale === loc
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary',
          ].join(' ')}
        >
          {t(loc)}
        </button>
      ))}
    </div>
  );
}
