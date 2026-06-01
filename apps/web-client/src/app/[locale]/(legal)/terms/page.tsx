import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalToc from '../_components/legal-toc';
import { OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';

export const metadata: Metadata = {
  title: 'Términos y Condiciones · Fractal',
  description:
    'Términos y Condiciones de Servicio de la Plataforma de Automatización de Workflows con IA de Fractal.',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3 leading-relaxed text-[var(--text-secondary)]">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-medium text-[var(--text-primary)]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={label} className={i % 2 === 0 ? 'bg-[var(--surface-secondary)]' : 'bg-[var(--surface)]'}>
              <td className="w-1/3 px-4 py-3 font-medium text-[var(--text-primary)]">{label}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

const bold = (chunks: React.ReactNode) => (
  <strong className="text-[var(--text-primary)]">{chunks}</strong>
);

export default async function TermsPage() {
  const t = await getTranslations('Terms');

  const sections = [
    { id: t('s1Id'), label: t('s1Label') },
    { id: t('s2Id'), label: t('s2Label') },
    { id: t('s3Id'), label: t('s3Label') },
    { id: t('s4Id'), label: t('s4Label') },
    { id: t('s5Id'), label: t('s5Label') },
    { id: t('s6Id'), label: t('s6Label') },
    { id: t('s7Id'), label: t('s7Label') },
    { id: t('s8Id'), label: t('s8Label') },
    { id: t('s9Id'), label: t('s9Label') },
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
            <p>{t('s1Text1')}</p>
            <p>{t.rich('s1Text2', { bold })}</p>
          </Section>

          <Section id={t('s2Id')} title={t('s2Title')}>
            <InfoTable rows={[
              [t('s2Row1Label'), t('s2Row1Value')],
              [t('s2Row2Label'), t('s2Row2Value')],
              [t('s2Row3Label'), t('s2Row3Value')],
              [t('s2Row4Label'), t('s2Row4Value')],
              [t('s2Row5Label'), t('s2Row5Value')],
              [t('s2Row6Label'), t('s2Row6Value')],
            ]} />
          </Section>

          <Section id={t('s3Id')} title={t('s3Title')}>
            <SubSection title={t('s3Sub1Title')}>
              <BulletList items={[t('s3Bullet1'), t('s3Bullet2'), t('s3Bullet3'), t('s3Bullet4'), t('s3Bullet5')]} />
            </SubSection>
            <SubSection title={t('s3Sub2Title')}>
              <BulletList items={[t('s3Bullet6'), t('s3Bullet7')]} />
            </SubSection>
            <SubSection title={t('s3Sub3Title')}>
              <p>{t('s3Sub3Text')}</p>
            </SubSection>
          </Section>

          <Section id={t('s4Id')} title={t('s4Title')}>
            <p>{t.rich('s4Text1', { bold })}</p>
            <p>{t('s4Text2')}</p>
            <div className="space-y-4 rounded-xl border border-[var(--border)] p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-bold text-[var(--text-primary)]">
                  1
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{t('s4Cost1Title')}</p>
                  <p className="text-sm">{t('s4Cost1Text')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-bold text-[var(--text-primary)]">
                  2
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{t('s4Cost2Title')}</p>
                  <p className="text-sm">{t.rich('s4Cost2Text', { bold, price: OVERAGE_PRICE_PER_CREDIT })}</p>
                </div>
              </div>
            </div>
            <SubSection title={t('s4Sub1Title')}>
              <InfoTable rows={[
                [t('s4Row1Label'), t('s4Row1Value')],
                [t('s4Row2Label'), t('s4Row2Value')],
                [t('s4Row3Label'), t('s4Row3Value')],
                [t('s4Row4Label'), t('s4Row4Value')],
                [t('s4Row5Label'), t('s4Row5Value')],
                [t('s4Row6Label'), t('s4Row6Value')],
              ]} />
            </SubSection>
            <SubSection title={t('s4Sub2Title')}>
              <InfoTable rows={[
                [t('s4Row1Label'), t('s4Cap1Value')],
                [t('s4Row2Label'), t('s4Cap2Value')],
                [t('s4Row3Label'), t('s4Cap3Value')],
                [t('s4Row4Label'), t('s4Cap4Value')],
                [t('s4Row5Label'), t('s4Cap5Value')],
                [t('s4Row6Label'), t('s4Cap6Value')],
              ]} />
            </SubSection>
          </Section>

          <Section id={t('s5Id')} title={t('s5Title')}>
            <p>{t.rich('s5Intro', { bold })}</p>
            <InfoTable rows={[
              [t('s5Row1Label'), t('s5Row1Value')],
              [t('s5Row2Label'), t('s5Row2Value')],
              [t('s5Row3Label'), t('s5Row3Value')],
            ]} />
            <p>{t.rich('s5Outro', { bold })}</p>
          </Section>

          <Section id={t('s6Id')} title={t('s6Title')}>
            <p>{t.rich('s6Text1', { bold })}</p>
            <p>{t('s6Text2')}</p>
            <p>{t.rich('s6Text3', { bold })}</p>
          </Section>

          <Section id={t('s7Id')} title={t('s7Title')}>
            <p>{t.rich('s7Text1', { bold })}</p>
            <p>{t('s7Text2')}</p>
            <BulletList items={[t('s7Bullet1'), t('s7Bullet2'), t('s7Bullet3'), t('s7Bullet4')]} />
          </Section>

          <Section id={t('s8Id')} title={t('s8Title')}>
            <p>{t.rich('s8Text', { bold })}</p>
          </Section>

          <Section id={t('s9Id')} title={t('s9Title')}>
            <BulletList items={[t('s9Bullet1'), t('s9Bullet2'), t('s9Bullet3'), t('s9Bullet4')]} />
          </Section>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>{t('finalNote')}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
