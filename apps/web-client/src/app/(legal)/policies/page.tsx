import React from 'react';
import type { Metadata } from 'next';
import LegalToc from '../_components/LegalToc';

export const metadata: Metadata = {
  title: 'Políticas · Fractal',
  description:
    'Políticas de cancelación, suspensión, niveles de servicio, soporte técnico y uso aceptable de Fractal.',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    <div>
      <h3 className="mb-2 font-medium text-[var(--text-primary)]">{title}</h3>
      <div className="space-y-2">{children}</div>
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

// ─── TOC ─────────────────────────────────────────────────────────────────────

const sections = [
  { id: 'cancelacion', label: 'Política de Cancelación' },
  { id: 'suspension', label: 'Cancelación y Downgrade' },
  { id: 'soporte', label: 'Soporte Técnico' },
  { id: 'uso-aceptable', label: 'Uso Aceptable' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <div className="mb-12 border-b border-[var(--border)] pb-10">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Políticas
        </h1>
        <p className="max-w-2xl text-[var(--text-secondary)]">
          Política de cancelación, suspensión por falta de pago, niveles de servicio, soporte
          técnico y uso aceptable de la Plataforma Fractal.
        </p>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        <LegalToc sections={sections} />

        {/* Body */}
        <article className="min-w-0 flex-1 space-y-12">
          {/* Cancelación */}
          <Section id="cancelacion" title="Política de Cancelación">
            <p>
              El Cliente puede cancelar su suscripción en cualquier momento, sin aviso previo ni
              penalidades, siempre que esté al corriente en sus pagos. Al cancelar, el acceso a la
              Plataforma se pierde de forma{' '}
              <strong className="text-[var(--text-primary)]">inmediata</strong>.
            </p>
            <p>
              Los pagos realizados, incluyendo suscripciones mensuales y el Setup Fee,{' '}
              <strong className="text-[var(--text-primary)]">
                no son reembolsables bajo ninguna circunstancia
              </strong>
              .
            </p>
          </Section>

          {/* Cancelación y Downgrade */}
          <Section id="suspension" title="Cancelación y Downgrade">
            <p>
              Al cancelar su suscripción de pago, el Cliente es degradado automáticamente al{' '}
              <strong className="text-[var(--text-primary)]">Plan Free</strong>. El saldo de
              créditos acumulados se conserva y puede seguir siendo utilizado para ejecutar
              workflows hasta agotarse.
            </p>

            <div className="space-y-3">
              {[
                {
                  label: 'Plan Free activo con créditos',
                  desc: 'Acceso completo a la Plataforma. Se pueden ejecutar workflows con el saldo acumulado disponible.',
                },
                {
                  label: 'Plan Free sin créditos',
                  desc: 'Acceso de lectura. El Cliente puede ver sus datos, historial y configuración, pero no ejecutar workflows hasta recargar o contratar un plan.',
                },
                {
                  label: 'Eliminación de datos',
                  desc: 'Los datos se conservan por un período prolongado. Fractal notificará al Cliente con suficiente anticipación antes de proceder con cualquier eliminación definitiva.',
                },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4"
                >
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">{label}</p>
                    <p className="text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SubSection title="Reactivación">
              <p>
                El Cliente puede contratar o reactivar un plan de pago en cualquier momento. Sus
                datos, workflows e historial se conservan íntegramente.
              </p>
            </SubSection>
          </Section>

          {/* Soporte */}
          <Section id="soporte" title="Política de Soporte Técnico">
            <SubSection title="Disponibilidad">
              <BulletList
                items={[
                  'Soporte con IA: disponible 24/7.',
                  'Soporte humano: horario laboral 9 am–6 pm (hora de México).',
                  'Idiomas: español e inglés en todos los planes.',
                ]}
              />
            </SubSection>
            <SubSection title="Tiempos de respuesta por plan">
              <InfoTable
                rows={[
                  ['Trial', 'Solo documentación y FAQs'],
                  ['Micro / Pequeño', 'Email · respuesta en 24 horas'],
                  ['Mediano', 'Email prioritario · respuesta en 12 horas'],
                  ['Grande', 'Email y WhatsApp · respuesta en 12 horas'],
                  ['Enterprise', 'Email, WhatsApp y Account Manager dedicado · 4–8 horas'],
                ]}
              />
            </SubSection>
          </Section>

          {/* Uso Aceptable */}
          <Section id="uso-aceptable" title="Política de Uso Aceptable">
            <SubSection title="Usos prohibidos">
              <BulletList
                items={[
                  'Actividad ilegal, incluyendo spam, phishing, fraude y violación de propiedad intelectual.',
                  'Abuso de recursos: evasión de rate limits o compartir API Keys con terceros.',
                  'Inclusión de contenido nocivo o ilegal en workflows.',
                  'Uso para desinformación masiva o generación de deep fakes sin consentimiento.',
                  'Reventa no autorizada del servicio (white label no permitido).',
                ]}
              />
            </SubSection>
            <SubSection title="Consecuencias por infracción">
              <InfoTable
                rows={[
                  ['Primera infracción', 'Advertencia con 7 días para corregir.'],
                  ['Segunda infracción', 'Suspensión de 30 días.'],
                  ['Tercera infracción', 'Terminación del servicio sin reembolso.'],
                  ['Infracciones graves', 'Terminación inmediata sin previo aviso.'],
                ]}
              />
            </SubSection>
          </Section>

          {/* Nota */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>
              Para reportar una infracción o consultar sobre estas políticas, contáctanos a través
              del panel de soporte.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
