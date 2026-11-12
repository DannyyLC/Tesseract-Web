import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import LegalToc from '../_components/legal-toc';

const SUPPORT_EMAIL = 'support@fractalops.com.mx';
const GOOGLE_USER_DATA_POLICY_URL =
  'https://developers.google.com/terms/api-services-user-data-policy';
const GOOGLE_PERMISSIONS_URL = 'https://myaccount.google.com/permissions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Privacy' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="mb-2 font-medium text-[var(--text-primary)]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--text-tertiary)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoTable({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? 'bg-[var(--surface-secondary)]' : 'bg-[var(--surface)]'}
            >
              <td className="w-1/3 px-4 py-3 align-top font-medium text-[var(--text-primary)]">
                {label}
              </td>
              <td className="px-4 py-3 align-top text-[var(--text-secondary)]">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nombre del permiso en lenguaje llano y, debajo, el scope tal como aparece en Google. */
function ScopeLabel({ name, scope }: { name: string; scope: string }) {
  return (
    <>
      <span className="block">{name}</span>
      <code className="mt-1 block break-all font-mono text-xs font-normal text-[var(--text-tertiary)]">
        {scope}
      </code>
    </>
  );
}

const bold = (chunks: React.ReactNode) => (
  <strong className="text-[var(--text-primary)]">{chunks}</strong>
);

const externalLink = (href: string) =>
  function ExternalLink(chunks: React.ReactNode) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--text-primary)] underline underline-offset-2 hover:opacity-70"
      >
        {chunks}
      </a>
    );
  };

const mail = (chunks: React.ReactNode) => (
  <a
    href={`mailto:${SUPPORT_EMAIL}`}
    className="text-[var(--text-primary)] underline underline-offset-2 hover:opacity-70"
  >
    {chunks}
  </a>
);

const policiesLink = (chunks: React.ReactNode) => (
  <Link
    href="/policies"
    className="text-[var(--text-primary)] underline underline-offset-2 hover:opacity-70"
  >
    {chunks}
  </Link>
);

const rich = { bold, mail, policies: policiesLink };

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');

  const sectionKeys = [
    'who',
    'data',
    'use',
    'google',
    'ai',
    'ownership',
    'subprocessors',
    'security',
    'retention',
    'rights',
    'changes',
  ] as const;

  const sections = sectionKeys.map((key) => ({
    id: t(`${key}.id`),
    label: t(`${key}.label`),
  }));

  const s = (key: (typeof sectionKeys)[number]) => ({
    id: t(`${key}.id`),
    title: t(`${key}.title`),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-12 border-b border-[var(--border)] pb-10">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {t('heading')}
        </h1>
        <p className="max-w-2xl text-[var(--text-secondary)]">{t('description')}</p>
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">{t('lastUpdated')}</p>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        <LegalToc sections={sections} />

        <article className="min-w-0 flex-1 space-y-12">
          {/* 1. Quiénes somos */}
          <Section {...s('who')}>
            <p>{t.rich('who.text1', rich)}</p>
            <p>{t.rich('who.text2', rich)}</p>
            <p>{t.rich('who.contact', rich)}</p>
          </Section>

          {/* 2. Información que recopilamos */}
          <Section {...s('data')}>
            <p>{t('data.intro')}</p>
            <InfoTable
              rows={[
                [t('data.row1Label'), t('data.row1Value')],
                [t('data.row2Label'), t('data.row2Value')],
                [t('data.row3Label'), t('data.row3Value')],
                [t('data.row4Label'), t('data.row4Value')],
                [t('data.row5Label'), t.rich('data.row5Value', rich)],
                [t('data.row6Label'), t('data.row6Value')],
              ]}
            />
          </Section>

          {/* 3. Cómo usamos la información */}
          <Section {...s('use')}>
            <p>{t('use.intro')}</p>
            <BulletList
              items={[
                t('use.bullet1'),
                t('use.bullet2'),
                t('use.bullet3'),
                t('use.bullet4'),
                t('use.bullet5'),
                t('use.bullet6'),
              ]}
            />
            <p>{t.rich('use.outro', rich)}</p>
          </Section>

          {/* 4. Datos de usuario de Google */}
          <Section {...s('google')}>
            <p>{t('google.intro')}</p>

            <SubSection title={t('google.scopesTitle')}>
              <InfoTable
                rows={[
                  [
                    <ScopeLabel
                      key="1"
                      name={t('google.scope1Name')}
                      scope="openid · email · profile"
                    />,
                    t('google.scope1Use'),
                  ],
                  [
                    <ScopeLabel
                      key="2"
                      name={t('google.scope2Name')}
                      scope="calendar.events.freebusy"
                    />,
                    t('google.scope2Use'),
                  ],
                  [
                    <ScopeLabel
                      key="3"
                      name={t('google.scope3Name')}
                      scope="calendar.events.readonly"
                    />,
                    t('google.scope3Use'),
                  ],
                  [
                    <ScopeLabel key="4" name={t('google.scope4Name')} scope="calendar.events" />,
                    t('google.scope4Use'),
                  ],
                  [
                    <ScopeLabel
                      key="5"
                      name={t('google.scope5Name')}
                      scope="spreadsheets.readonly"
                    />,
                    t('google.scope5Use'),
                  ],
                  [
                    <ScopeLabel key="6" name={t('google.scope6Name')} scope="spreadsheets" />,
                    t('google.scope6Use'),
                  ],
                  [
                    <ScopeLabel
                      key="7"
                      name={t('google.scope7Name')}
                      scope="userinfo.email · userinfo.profile"
                    />,
                    t('google.scope7Use'),
                  ],
                ]}
              />
              <p className="text-sm">{t('google.scopesNote')}</p>
            </SubSection>

            <SubSection title={t('google.useTitle')}>
              <p>{t.rich('google.useText', rich)}</p>
            </SubSection>

            <SubSection title={t('google.shareTitle')}>
              <p>{t.rich('google.shareText1', rich)}</p>
              <p>{t('google.shareText2')}</p>
            </SubSection>

            <SubSection title={t('google.storeTitle')}>
              <BulletList
                items={[
                  t('google.storeBullet1'),
                  t('google.storeBullet2'),
                  t('google.storeBullet3'),
                  t('google.storeBullet4'),
                ]}
              />
            </SubSection>

            <SubSection title={t('google.revokeTitle')}>
              <BulletList
                items={[
                  t.rich('google.revokeBullet1', rich),
                  t.rich('google.revokeBullet2', {
                    ...rich,
                    revoke: externalLink(GOOGLE_PERMISSIONS_URL),
                  }),
                  t.rich('google.revokeBullet3', rich),
                ]}
              />
            </SubSection>

            <div className="mt-4 rounded-xl border border-l-4 border-[var(--border)] border-l-[var(--accent)] bg-[var(--surface-secondary)] px-6 py-5">
              <h3 className="mb-2 font-medium text-[var(--text-primary)]">
                {t('google.limitedUseTitle')}
              </h3>
              <p>
                {t.rich('google.limitedUseText', {
                  ...rich,
                  link: externalLink(GOOGLE_USER_DATA_POLICY_URL),
                })}
              </p>
            </div>
          </Section>

          {/* 5. Inteligencia artificial */}
          <Section {...s('ai')}>
            <p>{t('ai.intro')}</p>
            <BulletList
              items={[t.rich('ai.bullet1', rich), t.rich('ai.bullet2', rich), t('ai.bullet3')]}
            />
          </Section>

          {/* 6. Propiedad de los datos */}
          <Section {...s('ownership')}>
            <p>{t.rich('ownership.text', rich)}</p>
            <p>{t('ownership.intro')}</p>
            <BulletList
              items={[t('ownership.bullet1'), t('ownership.bullet2'), t('ownership.bullet3')]}
            />
            <p>{t.rich('ownership.stats', rich)}</p>
          </Section>

          {/* 7. Subprocesadores */}
          <Section {...s('subprocessors')}>
            <p>{t.rich('subprocessors.text', rich)}</p>
            <InfoTable
              rows={[
                [t('subprocessors.row1Label'), t('subprocessors.row1Value')],
                [t('subprocessors.row2Label'), t('subprocessors.row2Value')],
                [t('subprocessors.row3Label'), t('subprocessors.row3Value')],
                [t('subprocessors.row4Label'), t('subprocessors.row4Value')],
                [t('subprocessors.row5Label'), t('subprocessors.row5Value')],
                [t('subprocessors.row6Label'), t('subprocessors.row6Value')],
                [t('subprocessors.row7Label'), t('subprocessors.row7Value')],
              ]}
            />
          </Section>

          {/* 8. Seguridad, almacenamiento y transferencias */}
          <Section {...s('security')}>
            <BulletList
              items={[
                t.rich('security.bullet1', rich),
                t('security.bullet2'),
                t('security.bullet3'),
                t('security.bullet4'),
              ]}
            />
            <p>{t.rich('security.transfers', rich)}</p>
          </Section>

          {/* 9. Conservación y eliminación */}
          <Section {...s('retention')}>
            <BulletList
              items={[
                t('retention.bullet1'),
                t.rich('retention.bullet2', rich),
                t.rich('retention.bullet3', rich),
                t('retention.bullet4'),
              ]}
            />
          </Section>

          {/* 10. Derechos ARCO */}
          <Section {...s('rights')}>
            <p>{t('rights.intro')}</p>
            <BulletList
              items={[
                t.rich('rights.bullet1', rich),
                t.rich('rights.bullet2', rich),
                t.rich('rights.bullet3', rich),
                t.rich('rights.bullet4', rich),
                t.rich('rights.bullet5', rich),
              ]}
            />
            <p>{t.rich('rights.how', rich)}</p>
            <p>{t('rights.endUsers')}</p>
          </Section>

          {/* 11. Cambios */}
          <Section {...s('changes')}>
            <p>{t.rich('changes.text', rich)}</p>
          </Section>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>{t.rich('finalNote', rich)}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
