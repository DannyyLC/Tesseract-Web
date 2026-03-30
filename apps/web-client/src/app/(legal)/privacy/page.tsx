import React from 'react';
import type { Metadata } from 'next';
import LegalToc from '../_components/LegalToc';

export const metadata: Metadata = {
  title: 'Política de Privacidad de Datos · Fractal',
  description: 'Política de privacidad y protección de datos de Fractal, conforme a la LFPDPPP.',
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
  { id: 'propiedad', label: 'Propiedad de los Datos' },
  { id: 'uso-fractal', label: 'Uso por Parte de Fractal' },
  { id: 'prohibiciones', label: 'Prohibiciones Estrictas' },
  { id: 'subprocesadores', label: 'Subprocesadores Autorizados' },
  { id: 'almacenamiento', label: 'Almacenamiento y Transferencias' },
  { id: 'derechos', label: 'Derechos del Cliente' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <div className="mb-12 border-b border-[var(--border)] pb-10">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Privacidad de Datos
        </h1>
        <p className="max-w-2xl text-[var(--text-secondary)]">
          Descripción de cómo Fractal gestiona, protege y procesa los datos del Cliente, conforme a
          la Ley Federal de Protección de Datos Personales en Posesión de los Particulares
          (LFPDPPP).
        </p>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        <LegalToc sections={sections} />

        {/* Body */}
        <article className="min-w-0 flex-1 space-y-12">
          {/* Propiedad */}
          <Section id="propiedad" title="Propiedad de los Datos">
            <p>
              El Cliente es propietario del{' '}
              <strong className="text-[var(--text-primary)]">100 % de sus datos y workflows</strong>
              . Fractal actúa únicamente como{' '}
              <strong className="text-[var(--text-primary)]">Encargado de Procesamiento</strong>{' '}
              conforme a la LFPDPPP y no adquiere ningún derecho sobre dicha información.
            </p>
          </Section>

          {/* Uso por Fractal */}
          <Section id="uso-fractal" title="Uso por Parte de Fractal">
            <p>
              Fractal puede utilizar estadísticas{' '}
              <strong className="text-[var(--text-primary)]">agregadas y anónimas</strong> para
              mejorar el producto. En ningún caso se identifican clientes específicos en dichos
              análisis ni se comparten datos individuales.
            </p>
          </Section>

          {/* Prohibiciones */}
          <Section id="prohibiciones" title="Prohibiciones Estrictas">
            <p>Está estrictamente prohibido que Fractal:</p>
            <BulletList
              items={[
                'Entrene modelos propios con datos de clientes.',
                'Venda datos a terceros.',
                'Comparta datos con terceros no autorizados.',
              ]}
            />
          </Section>

          {/* Subprocesadores */}
          <Section id="subprocesadores" title="Subprocesadores Autorizados">
            <p>
              El Cliente autoriza el uso de los siguientes subprocesadores al contratar el servicio.
              Fractal notificará cualquier cambio con{' '}
              <strong className="text-[var(--text-primary)]">30 días de anticipación</strong>.
            </p>
            <InfoTable
              rows={[
                ['Google Cloud Platform', 'Hosting e infraestructura de la Plataforma.'],
                ['OpenAI', 'Modelos de IA, según la configuración de cada workflow.'],
                ['Anthropic', 'Modelos de IA, según la configuración de cada workflow.'],
                ['Google AI', 'Modelos de IA, según la configuración de cada workflow.'],
              ]}
            />
          </Section>

          {/* Almacenamiento y Transferencias */}
          <Section id="almacenamiento" title="Almacenamiento y Transferencias Internacionales">
            <p>
              Los datos se almacenan en{' '}
              <strong className="text-[var(--text-primary)]">
                Estados Unidos (Google Cloud us-central)
              </strong>
              . La transferencia internacional de datos se realiza bajo la base legal de{' '}
              <strong className="text-[var(--text-primary)]">
                Cláusulas Contractuales Estándar (SCC)
              </strong>
              , conforme a las salvaguardas reconocidas por la LFPDPPP.
            </p>
          </Section>

          {/* Derechos del Cliente */}
          <Section id="derechos" title="Derechos del Cliente">
            <p>Conforme a la LFPDPPP, el Cliente tiene derecho a:</p>
            <BulletList
              items={[
                'Acceder a sus datos almacenados en la Plataforma.',
                'Rectificar datos inexactos.',
                'Cancelar o eliminar sus datos (sujeto a los períodos de retención establecidos en la Política de Suspensión).',
                'Oponerse al tratamiento de sus datos para fines específicos.',
              ]}
            />
            <p>
              Para ejercer cualquiera de estos derechos, contáctanos a través del panel de soporte
              indicando claramente la solicitud.
            </p>
          </Section>

          {/* Nota final */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>
              Para cualquier duda sobre el tratamiento de tus datos, escríbenos al área de
              privacidad a través del panel de soporte.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
