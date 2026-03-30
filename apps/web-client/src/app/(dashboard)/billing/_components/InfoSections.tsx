'use client';

import { OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';
import { Headphones, Mail, Cpu, Sparkles, MessageSquare, Zap } from 'lucide-react';

const TIERS = [
  {
    id: 'T1',
    name: 'Ligero',
    cost: '1 Crédito',
    models: 'Gemini 1.5 Flash',
    context: '20,000 tokens',
    description: 'Para tareas directas y disparadores simples.',
    icon: <Zap size={18} />,
  },
  {
    id: 'T2',
    name: 'Operativo',
    cost: '5 Créditos',
    models: 'GPT-4o, Gemini 2.5 Pro',
    context: '50,000 tokens',
    description: 'Análisis de datos y lógica de negocio multi-paso.',
    icon: <Cpu size={18} />,
  },
  {
    id: 'T3',
    name: 'Estratégico',
    cost: '25 Créditos',
    models: 'Claude 4.5 Opus, GPT-5.1',
    context: '128,000 tokens',
    description: 'Máxima precisión y manejo de documentos extensos.',
    icon: <Sparkles size={18} />,
  },
];

const SUPPORT = [
  {
    title: 'Email (48h)',
    desc: 'Consultas no urgentes con respuesta garantizada.',
    icon: <Mail size={18} />,
  },
  {
    title: 'Prioritario (24h)',
    desc: 'Tu ticket se eleva en la cola para resolución acelerada.',
    icon: <MessageSquare size={18} />,
  },
  {
    title: 'Respuesta (12h)',
    desc: 'Tiempos de resolución ultra-rápidos para tu operación.',
    icon: <Zap size={18} />,
  },
  {
    title: 'Account Manager',
    desc: 'Atención vía Slack/WhatsApp con prioridad máxima.',
    icon: <Headphones size={18} />,
  },
];

export default function InfoSections() {
  return (
    <div className="space-y-16 py-8">
      {/* Credits Definition */}
      <section className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-black dark:text-white">¿Qué es un Crédito?</h2>
          <p className="max-w-2xl leading-relaxed text-black/50 dark:text-white/50">
            Es nuestra unidad de medida. No cobramos por ejecución, sino por la complejidad del
            razonamiento requerido. El precio por crédito de overage es de ${OVERAGE_PRICE_PER_CREDIT} USD.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className="group rounded-2xl border border-black/5 bg-white p-6 transition-all hover:border-black/20 dark:border-white/5 dark:bg-[#0A0A0A] dark:hover:border-white/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-black/80 transition-all group-hover:scale-110 dark:bg-white/5 dark:text-white/80">
                {tier.icon}
              </div>
              <h3 className="flex items-center justify-between font-bold text-black dark:text-white">
                {tier.name}
                <span className="font-geist-mono text-xs font-bold uppercase tracking-tighter opacity-40">
                  {tier.id}
                </span>
              </h3>
              <p className="font-geist-mono mt-1 text-lg font-bold text-black dark:text-white">
                {tier.cost}
              </p>

              <div className="mt-4 space-y-2 border-t border-black/5 pt-4 text-sm dark:border-white/5">
                <p className="text-black/60 dark:text-white/60">
                  <span className="font-bold text-black dark:text-white">Modelos:</span>{' '}
                  {tier.models}
                </p>
                <p className="text-black/60 dark:text-white/60">
                  <span className="font-bold text-black dark:text-white">Contexto:</span>{' '}
                  <span className="font-geist-mono">{tier.context}</span>
                </p>
                <p className="mt-3 text-xs italic text-black/40 dark:text-white/40">
                  {tier.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Support levels */}
      <section className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-black dark:text-white">
            Capas de Soporte Técnico
          </h2>
          <p className="max-w-2xl leading-relaxed text-black/50 dark:text-white/50">
            Atención diseñada para garantizar que tu operación fluya sin interrupciones.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORT.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-transparent bg-[#F5F5F5] p-5 transition-all hover:border-black/5 dark:bg-[#111]"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
                {item.icon}
              </div>
              <h4 className="text-sm font-bold text-black dark:text-white">{item.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-black/50 dark:text-white/50">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
