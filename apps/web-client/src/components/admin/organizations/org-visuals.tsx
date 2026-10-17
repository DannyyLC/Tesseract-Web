'use client';

import type { ReactNode } from 'react';
import { Database, KeyRound, Rows3, Users, Workflow, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';

/**
 * Piezas visuales compartidas por el resumen de la fila expandida del listado y la pestaña
 * General del detalle de una organización, para que las dos se lean igual.
 */

/**
 * Color de cada plan: el escalón de precio se reconoce de un vistazo sin leer la etiqueta.
 * ENTERPRISE usa el morado de las gráficas porque no hay una escala de marca para él.
 */
const PLAN_COLOR: Record<string, string> = {
  FREE: 'var(--chart-axis)',
  STARTER: 'var(--info-500)',
  GROWTH: 'var(--success-500)',
  BUSINESS: 'var(--warning-500)',
  PRO: 'var(--chart-execution)',
  ENTERPRISE: 'var(--chart-hallucination)',
};

export function planColor(plan: string): string {
  return PLAN_COLOR[plan] ?? 'var(--chart-axis)';
}

export type Level = 'ok' | 'warning' | 'danger';

export const LEVEL_COLOR: Record<Level, string> = {
  ok: 'var(--success-500)',
  warning: 'var(--warning-500)',
  danger: 'var(--danger-500)',
};

/** Uso contra un límite: verde hasta 70 %, ámbar hasta 90 %, rojo desde ahí. */
export function usageLevel(ratio: number): Level {
  if (ratio >= 0.9) return 'danger';
  if (ratio >= 0.7) return 'warning';
  return 'ok';
}

/** Saldo de créditos: al revés que el uso, lo preocupante es que quede poco. */
export function balanceLevel(ratio: number): Level {
  if (ratio <= 0.1) return 'danger';
  if (ratio <= 0.3) return 'warning';
  return 'ok';
}

/** Días completos que faltan para una fecha (0 si ya pasó). */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function Meter({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint)]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Bloque con encabezado en versalitas; con borde por defecto, el contenedor de las tarjetas. */
export function StatCard({
  label,
  children,
  bordered = true,
  className = '',
}: {
  label: string;
  children: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div className={`${bordered ? 'rounded-xl border border-border p-4' : ''} ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Saldo de créditos contra lo que da el plan al mes, con barra de lo que queda. */
export function CreditsCard({
  org,
  bordered = true,
}: {
  org: AdminOrganizationDetail;
  bordered?: boolean;
}) {
  const t = useTranslations('Admin.OrganizationSummary');
  const intlLocale = toIntlLocale(useLocale());
  const num = (value: number) => value.toLocaleString(intlLocale);

  const monthlyCredits = org.planLimits.limits.monthlyCredits;
  const credits = org.usage.credits;
  const hasCreditCap = monthlyCredits > 0;
  const creditRatio = hasCreditCap ? credits / monthlyCredits : 1;
  const level: Level = credits < 0 ? 'danger' : balanceLevel(creditRatio);

  return (
    <StatCard label={t('credits')} bordered={bordered}>
      <p className="font-geist-mono mt-2 text-3xl font-light tracking-tight">
        <span style={{ color: LEVEL_COLOR[level] }}>{num(credits)}</span>
        {hasCreditCap && (
          <span className="text-lg text-text-tertiary"> / {num(monthlyCredits)}</span>
        )}
      </p>
      {hasCreditCap && (
        <div className="mt-3 space-y-1.5">
          <Meter ratio={creditRatio} color={LEVEL_COLOR[level]} />
          <p className="text-xs text-text-tertiary">
            {credits < 0
              ? t('negativeBalance')
              : credits > monthlyCredits
                ? t('creditsAbovePlan', { extra: num(credits - monthlyCredits) })
                : t('creditsAvailable', { pct: Math.round(creditRatio * 100) })}
          </p>
        </div>
      )}
    </StatCard>
  );
}

/**
 * Una minitarjeta por límite del plan con "usado / máximo" y barra de uso. Con `showCustom`,
 * marca los límites que tienen un override manual sobre el default del plan.
 */
export function UsageGrid({
  org,
  showCustom = false,
  showIcons = true,
  className = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5',
}: {
  org: AdminOrganizationDetail;
  showCustom?: boolean;
  showIcons?: boolean;
  className?: string;
}) {
  const t = useTranslations('Admin.OrganizationSummary');
  const intlLocale = toIntlLocale(useLocale());
  const num = (value: number) => value.toLocaleString(intlLocale);
  const limits = org.planLimits.limits;

  const items: {
    key: string;
    label: string;
    icon: LucideIcon;
    used: number;
    max: number;
    custom: boolean;
  }[] = [
    {
      key: 'workflows',
      label: t('workflows'),
      icon: Workflow,
      used: org.usage.workflows,
      max: limits.maxWorkflows,
      custom: org.customMaxWorkflows != null,
    },
    {
      key: 'users',
      label: t('users'),
      icon: Users,
      used: org.usage.users,
      max: limits.maxUsers,
      custom: org.customMaxUsers != null,
    },
    {
      key: 'apiKeys',
      label: t('apiKeys'),
      icon: KeyRound,
      used: org.usage.apiKeys,
      max: limits.maxApiKeys,
      custom: org.customMaxApiKeys != null,
    },
    {
      key: 'datasets',
      label: t('datasets'),
      icon: Database,
      used: org.usage.datasets,
      max: limits.maxDatasets,
      custom: org.customMaxDatasets != null,
    },
    {
      key: 'datasetRows',
      label: t('datasetRows'),
      icon: Rows3,
      used: org.usage.datasetRows,
      max: limits.maxDatasetRows,
      custom: org.customMaxDatasetRows != null,
    },
  ];

  return (
    <div className={className}>
      {items.map(({ key, label, icon: Icon, used, max, custom }) => {
        const unlimited = max === -1;
        const ratio = unlimited || max <= 0 ? 0 : used / max;
        return (
          <div key={key} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              {showIcons && <Icon size={13} className="text-text-tertiary" />}
              <span className="truncate">{label}</span>
            </div>
            <p className="font-geist-mono text-lg text-text-primary">
              {num(used)}
              <span className="text-sm text-text-tertiary"> / {unlimited ? '∞' : num(max)}</span>
            </p>
            {unlimited ? (
              <p className="text-[11px] text-text-tertiary">{t('unlimited')}</p>
            ) : (
              <Meter ratio={ratio} color={LEVEL_COLOR[usageLevel(ratio)]} />
            )}
            {showCustom && custom && (
              <p className="text-[11px] font-medium text-[var(--info-text-adaptive)]">
                {t('customLimit')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
