'use client';

import { OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';
import { Headphones, Mail, Cpu, Sparkles, MessageSquare, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function InfoSections() {
  const t = useTranslations('BillingInfoSections');

  const TIERS = [
    {
      id: 'T1',
      name: t('t1Name'),
      cost: t('t1Cost'),
      models: 'Gemini 1.5 Flash',
      context: t('t1Context'),
      description: t('t1Desc'),
      icon: <Zap size={18} />,
    },
    {
      id: 'T2',
      name: t('t2Name'),
      cost: t('t2Cost'),
      models: 'GPT-4o, Gemini 2.5 Pro',
      context: t('t2Context'),
      description: t('t2Desc'),
      icon: <Cpu size={18} />,
    },
    {
      id: 'T3',
      name: t('t3Name'),
      cost: t('t3Cost'),
      models: 'Claude 4.5 Opus, GPT-5.1',
      context: t('t3Context'),
      description: t('t3Desc'),
      icon: <Sparkles size={18} />,
    },
  ];

  const SUPPORT = [
    {
      title: t('support1Title'),
      desc: t('support1Desc'),
      icon: <Mail size={18} />,
    },
    {
      title: t('support2Title'),
      desc: t('support2Desc'),
      icon: <MessageSquare size={18} />,
    },
    {
      title: t('support3Title'),
      desc: t('support3Desc'),
      icon: <Zap size={18} />,
    },
    {
      title: t('support4Title'),
      desc: t('support4Desc'),
      icon: <Headphones size={18} />,
    },
  ];

  return (
    <div className="space-y-16 py-8">
      {/* Credits Definition */}
      <section className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">{t('creditHeading')}</h2>
          <p className="max-w-2xl leading-relaxed text-text-secondary">
            {t('creditDesc', { price: OVERAGE_PRICE_PER_CREDIT })}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className="group rounded-2xl border border-border bg-surface p-6 transition-all hover:border-border-hover"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary transition-all group-hover:scale-110">
                {tier.icon}
              </div>
              <h3 className="flex items-center justify-between font-bold text-text-primary">
                {tier.name}
                <span className="font-geist-mono text-xs font-bold uppercase tracking-tighter opacity-40">
                  {tier.id}
                </span>
              </h3>
              <p className="font-geist-mono mt-1 text-lg font-bold text-text-primary">
                {tier.cost}
              </p>

              <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <p className="text-text-secondary">
                  <span className="font-bold text-text-primary">{t('models')}</span> {tier.models}
                </p>
                <p className="text-text-secondary">
                  <span className="font-bold text-text-primary">{t('context')}</span>{' '}
                  <span className="font-geist-mono">{tier.context}</span>
                </p>
                <p className="mt-3 text-xs italic text-text-tertiary">{tier.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Support levels */}
      <section className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">{t('supportHeading')}</h2>
          <p className="max-w-2xl leading-relaxed text-text-secondary">{t('supportDesc')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORT.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-hover"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary">
                {item.icon}
              </div>
              <h4 className="text-sm font-bold text-text-primary">{item.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
