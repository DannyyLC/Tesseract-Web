'use client';

import { Building2, ArrowRight, Handshake } from 'lucide-react';
import PermissionGuard from '@/components/auth/permission-guard';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function SpecializedCards() {
  const router = useRouter();
  const t = useTranslations('BillingSpecialized');

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Consultancy */}
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-8 lg:col-span-3">
        <div className="relative z-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-surface-secondary p-2.5 text-text-primary">
              <Handshake size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-text-primary">
                {t('consultancyTitle')}
              </h3>
              <div className="flex flex-col">
                <span className="font-geist-mono font-bold text-text-primary">
                  {t('consultancyPrice')}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                  {t('firstDiagnosticFree')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-text-tertiary">
                {t('formationLabel')}
              </p>
              <p className="text-xs font-medium leading-relaxed text-text-secondary">
                {t('formationDesc')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-text-tertiary">
                {t('explorationLabel')}
              </p>
              <p className="text-xs font-medium leading-relaxed text-text-secondary">
                {t('explorationDesc')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-text-tertiary">
                {t('refinementLabel')}
              </p>
              <p className="text-xs font-medium leading-relaxed text-text-secondary">
                {t('refinementDesc')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-text-tertiary">
                {t('vigilanceLabel')}
              </p>
              <p className="text-xs font-medium leading-relaxed text-text-secondary">
                {t('vigilanceDesc')}
              </p>
            </div>
          </div>

          <PermissionGuard permissions="billing:update_plan">
            <button
              onClick={() => router.push('/support?reason=consulting')}
              className="mt-8 flex items-center gap-2 text-sm font-bold text-text-primary transition-all hover:gap-3"
            >
              {t('scheduleConsultancy')}
              <ArrowRight size={16} />
            </button>
          </PermissionGuard>
        </div>

        {/* Decor */}
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-surface-secondary blur-[80px]" />
      </div>

      {/* Enterprise */}
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-neutral-800 to-brand-black p-8 text-brand-white shadow-2xl lg:col-span-2">
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Building2 size={24} />
          </div>

          <h3 className="text-2xl font-bold tracking-tight">{t('enterpriseTitle')}</h3>
          <p className="mt-1 text-sm font-bold text-brand-white/40">{t('enterpriseStarting')}</p>

          <div className="mt-8 flex-1 space-y-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-white/30">
              {t('infraLabel')}
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-brand-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-white" /> {t('dedicatedServers')}
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-brand-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-white" /> {t('customWorkflowLimit')}
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-brand-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-white" /> {t('fullCustomization')}
            </p>
            <p className="mt-2 text-[10px] italic text-brand-white/30">
              {t('enterpriseNote')}
            </p>
          </div>

          <PermissionGuard permissions="billing:update_plan">
            <button
              onClick={() => router.push('/support?reason=enterprise')}
              className="mt-10 w-full rounded-xl bg-brand-white py-3.5 font-bold text-brand-black transition-all hover:opacity-80 active:scale-[0.98]"
            >
              {t('contactButton')}
            </button>
          </PermissionGuard>
        </div>

        {/* Abstract shape */}
        <div className="absolute -bottom-10 -right-10 h-40 w-40 animate-pulse rounded-full bg-white/10 blur-[60px]" />
      </div>
    </div>
  );
}
