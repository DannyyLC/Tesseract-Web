import type { Metadata } from 'next';
import LegalToc from '../_components/LegalToc';
import { OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';

export const metadata: Metadata = {
  title: 'Términos y Condiciones · Fractal',
  description:
    'Términos y Condiciones de Servicio de la Plataforma de Automatización de Workflows con IA de Fractal.',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── TOC ────────────────────────────────────────────────────────────────────

const sections = [
  { id: 'introduccion', label: '1. Introducción y Aceptación' },
  { id: 'definiciones', label: '2. Definiciones Clave' },
  { id: 'descripcion', label: '3. Descripción del Servicio' },
  { id: 'planes', label: '4. Planes y Facturación' },
  { id: 'limites', label: '5. Límites Técnicos por Plan' },
  { id: 'propiedad', label: '6. Propiedad y Responsabilidad' },
  { id: 'modificaciones', label: '7. Modificaciones y Terminación' },
  { id: 'ley', label: '8. Ley Aplicable y Jurisdicción' },
  { id: 'disposiciones', label: '9. Disposiciones Generales' },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <div className="mb-12 border-b border-[var(--border)] pb-10">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Términos y Condiciones
        </h1>
        <p className="max-w-2xl text-[var(--text-secondary)]">
          Estos Términos constituyen el acuerdo legal entre usted y Fractal respecto al acceso y uso
          de nuestra plataforma de automatización de workflows con inteligencia artificial.
        </p>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        <LegalToc sections={sections} />

        {/* Body */}
        <article className="min-w-0 flex-1 space-y-12">
          {/* 1. Introducción */}
          <Section id="introduccion" title="1. Introducción y Aceptación">
            <p>
              Estos Términos y Condiciones (los "Términos") constituyen un acuerdo legal entre usted
              (el "Cliente") y Fractal respecto al acceso y uso de nuestra plataforma de
              automatización de workflows con inteligencia artificial (los "Servicios").
            </p>
            <p>
              Al utilizar los Servicios, usted acepta estos Términos en su totalidad. Si no está de
              acuerdo, no utilice la Plataforma. Nos reservamos el derecho de modificar estos
              Términos con{' '}
              <strong className="text-[var(--text-primary)]">30 días de notificación previa</strong>
              .
            </p>
          </Section>

          {/* 2. Definiciones */}
          <Section id="definiciones" title="2. Definiciones Clave">
            <InfoTable
              rows={[
                ['Workflow', 'Flujo de trabajo automatizado con IA.'],
                ['Petición', 'Cada ejecución de un workflow que consume recursos.'],
                [
                  'Plan',
                  'Nivel de servicio contratado (Free, Starter, Growth, Business, Pro, Enterprise).',
                ],
                ['Setup Fee', 'Tarifa única de implementación inicial.'],
                ['API Key', 'Clave de autenticación para acceso programático.'],
                [
                  'Tokens',
                  'Unidades de procesamiento de IA (aproximadamente 0.75 palabras por token).',
                ],
              ]}
            />
          </Section>

          {/* 3. Descripción del Servicio */}
          <Section id="descripcion" title="3. Descripción del Servicio">
            <SubSection title="Servicios incluidos">
              <BulletList
                items={[
                  'Acceso web y por API a la Plataforma.',
                  'Workflows personalizados creados por Fractal.',
                  'Integración con modelos de IA (OpenAI, Anthropic, Google).',
                  'Panel de gestión y monitoreo, historial de ejecuciones.',
                  'Soporte técnico según el Plan contratado.',
                ]}
              />
            </SubSection>
            <SubSection title="Servicios no incluidos">
              <BulletList
                items={[
                  'Integraciones personalizadas ni consultoría extensiva.',
                  'Capacitación presencial ni migración de datos desde otras plataformas.',
                ]}
              />
            </SubSection>
            <SubSection title="Selección de modelos de IA">
              <p>
                Fractal determina el modelo más apropiado para cada petición, seleccionando entre
                los modelos disponibles de sus proveedores de IA (OpenAI, Anthropic y Google). El
                Cliente no puede especificar el modelo a utilizar.
              </p>
            </SubSection>
          </Section>

          {/* 4. Planes y Facturación */}
          <Section id="planes" title="4. Planes y Facturación">
            <p>
              El sistema opera bajo un modelo de{' '}
              <strong className="text-[var(--text-primary)]">créditos mensuales</strong>. Cada Plan
              incluye un saldo de créditos que se renueva automáticamente al inicio de cada ciclo de
              facturación. Los créditos no utilizados se acumulan al siguiente mes.
            </p>
            <p>La estructura de costos se compone de los siguientes elementos:</p>
            <div className="space-y-4 rounded-xl border border-[var(--border)] p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-bold text-[var(--text-primary)]">
                  1
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Suscripción Mensual</p>
                  <p className="text-sm">
                    Cargo recurrente que incluye el saldo de créditos del Plan contratado.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-bold text-[var(--text-primary)]">
                  2
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Excedentes (Overage)</p>
                  <p className="text-sm">
                    Al agotar el saldo mensual, el sistema puede continuar operando en modo overage,
                    sujeto al límite del Plan. Los créditos consumidos en exceso se facturan al
                    final del mes a{' '}
                    <strong className="text-[var(--text-primary)]">${OVERAGE_PRICE_PER_CREDIT} USD por crédito</strong>.
                    El Plan Free no permite overages.
                  </p>
                </div>
              </div>
            </div>

            <SubSection title="Créditos mensuales incluidos por plan">
              <InfoTable
                rows={[
                  ['Free', '0 créditos (sin overage)'],
                  ['Starter', '200 créditos · overage hasta 200 créditos'],
                  ['Growth', '650 créditos · overage hasta 650 créditos'],
                  ['Business', '1,800 créditos · overage hasta 1,800 créditos'],
                  ['Pro', '5,000 créditos · overage hasta 5,000 créditos'],
                  ['Enterprise', 'Personalizado'],
                ]}
              />
            </SubSection>

            <SubSection title="Capacidad por plan">
              <InfoTable
                rows={[
                  ['Free', '1 usuario · 3 workflows · 3 API keys'],
                  ['Starter', '10 usuarios · 10 workflows · 50 API keys'],
                  ['Growth', '25 usuarios · 25 workflows · 100 API keys'],
                  ['Business', '50 usuarios · 100 workflows · 250 API keys'],
                  ['Pro', '100 usuarios · 250 workflows · 500 API keys'],
                  ['Enterprise', 'Personalizado (ilimitado)'],
                ]}
              />
            </SubSection>
          </Section>

          {/* 5. Límites Técnicos */}
          <Section id="limites" title="5. Categorías de Workflows y Consumo de Créditos">
            <p>
              Cada ejecución de un workflow consume créditos según su{' '}
              <strong className="text-[var(--text-primary)]">categoría</strong>, que determina la
              complejidad, el límite de tokens y el costo:
            </p>
            <InfoTable
              rows={[
                ['Light — 1 crédito', 'Tareas simples y directas · hasta 20,000 tokens'],
                [
                  'Standard — 5 créditos',
                  'Workflows multi-paso con herramientas · hasta 100,000 tokens',
                ],
                [
                  'Advanced — 20 créditos',
                  'Agentes complejos con reasoning avanzado · hasta 250,000 tokens',
                ],
              ]}
            />
            <p>
              La categoría de cada workflow es asignada por Fractal al momento de su creación y
              refleja los recursos computacionales requeridos. Un workflow{' '}
              <strong className="text-[var(--text-primary)]">Advanced</strong> con 5,000 créditos
              mensuales permite hasta 250 ejecuciones; uno{' '}
              <strong className="text-[var(--text-primary)]">Light</strong> permitiría hasta 5,000
              ejecuciones con el mismo saldo.
            </p>
          </Section>

          {/* 6. Propiedad y Responsabilidad */}
          <Section id="propiedad" title="6. Propiedad y Responsabilidad">
            <p>
              El Cliente es propietario del{' '}
              <strong className="text-[var(--text-primary)]">100% de sus datos y workflows</strong>.
              Fractal actúa como Encargado de Procesamiento conforme a la LFPDPPP.
            </p>
            <p>
              Fractal es responsable cuando un workflow creado por Fractal falla por un error
              propio: en ese caso lo corregirá sin costo y compensará al Cliente con créditos.
              Fractal <em>no</em> es responsable por fallas de proveedores de IA, del proveedor de
              hosting, ni por causas de fuerza mayor.
            </p>
            <p>
              La responsabilidad total de Fractal no excederá el{' '}
              <strong className="text-[var(--text-primary)]">
                monto pagado por el Cliente en los últimos 12 meses
              </strong>
              .
            </p>
          </Section>

          {/* 7. Modificaciones y Terminación */}
          <Section id="modificaciones" title="7. Modificaciones y Terminación">
            <p>
              Fractal puede modificar funcionalidades, precios o modelos de IA con{' '}
              <strong className="text-[var(--text-primary)]">30 días de notificación previa</strong>
              . Durante ese período, el Cliente puede cancelar sin penalidad.
            </p>
            <p>Fractal puede suspender o terminar el servicio si el Cliente:</p>
            <BulletList
              items={[
                'Viola estos Términos.',
                'Realiza actividad fraudulenta o ilegal.',
                'Incurre en falta de pago persistente.',
                'Abusa del servicio.',
              ]}
            />
          </Section>

          {/* 8. Ley Aplicable */}
          <Section id="ley" title="8. Ley Aplicable y Jurisdicción">
            <p>
              Estos Términos se rigen por las leyes de los{' '}
              <strong className="text-[var(--text-primary)]">Estados Unidos Mexicanos</strong>.
              Cualquier controversia se someterá a la jurisdicción de los tribunales de{' '}
              <strong className="text-[var(--text-primary)]">Aguascalientes, México</strong>,
              renunciando expresamente a cualquier otro fuero que pudiera corresponder.
            </p>
          </Section>

          {/* 9. Disposiciones Generales */}
          <Section id="disposiciones" title="9. Disposiciones Generales">
            <BulletList
              items={[
                'Estos Términos constituyen el acuerdo completo entre las partes.',
                'El Cliente no puede ceder este acuerdo sin consentimiento escrito de Fractal.',
                'Si alguna cláusula resulta inválida, el resto permanece vigente.',
                'No ejercer un derecho no constituye renuncia al mismo.',
              ]}
            />
          </Section>

          {/* Last updated */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)]">
            <p>
              Para consultas sobre estos Términos, contáctanos a través de nuestro panel de soporte.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
