import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalToc from '../_components/legal-toc';

export const metadata: Metadata = {
  title: 'Política de Privacidad de Datos · Fractal',
  description: 'Política de privacidad y protección de datos de Fractal, conforme a la LFPDPPP.',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-[var(--text-secondary)]">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--text-tertiary)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr
              key={label}
              className={i % 2 === 0 ? 'bg-[var(--surface-secondary)]' : 'bg-[var(--surface)]'}
            >
              <td className="w-1/3 px-4 py-3 font-medium text-[var(--text-primary)]">{label}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const bold = (chunks: React.ReactNode) => (
  <strong className="text-[var(--text-primary)]">{chunks}</strong>
);

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');

  const sections = [
    { id: t('s1Id'), label: t('s1Label') },
    { id: t('s2Id'), label: t('s2Label') },
    { id: t('s3Id'), label: t('s3Label') },
    { id: t('s4Id'), label: t('s4Label') },
    { id: t('s5Id'), label: t('s5Label') },
    { id: t('s6Id'), label: t('s6Label') },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-12 border-b border-[var(--border)] pb-10">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {t('heading')}
        </h1>
        <p className="max-w-2xl text-[var(--text-secondary)]">{t('description')}</p>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        <LegalToc sections={sections} />

        <article className="min-w-0 flex-1 space-y-12">
          <Section id={t('s1Id')} title={t('s1Title')}>
            <p>{t.rich('s1Text', { bold })}</p>
          </Section>

          <Section id={t('s2Id')} title={t('s2Title')}>
            <p>{t.rich('s2Text', { bold })}</p>
          </Section>

          <Section id={t('s3Id')} title={t('s3Title')}>
            <p>{t('s3Intro')}</p>
            <BulletList items={[t('s3Bullet1'), t('s3Bullet2'), t('s3Bullet3')]} />
          </Section>

          <Section id={t('s4Id')} title={t('s4Title')}>
            <p>{t.rich('s4Text', { bold })}</p>
            <InfoTable
              rows={[
                [t('s4Row1Label'), t('s4Row1Value')],
                [t('s4Row2Label'), t('s4Row2Value')],
                [t('s4Row3Label'), t('s4Row3Value')],
                [t('s4Row4Label'), t('s4Row4Value')],
              ]}
            />
          </Section>

          <Section id={t('s5Id')} title={t('s5Title')}>
            <p>{t.rich('s5Text', { bold })}</p>
          </Section>

          <Section id={t('s6Id')} title={t('s6Title')}>
            <p>{t('s6Intro')}</p>
            <BulletList items={[t('s6Bullet1'), t('s6Bullet2'), t('s6Bullet3'), t('s6Bullet4')]} />
            <p>{t('s6Outro')}</p>
          </Section>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>{t('finalNote')}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
