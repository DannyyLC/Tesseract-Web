'use client';

import { Building2, Presentation, ArrowRight, Handshake } from 'lucide-react';

export default function SpecializedCards() {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Consultancy */}
      <div className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-8 lg:col-span-3 dark:border-white/5 dark:bg-[#0A0A0A]">
        <div className="relative z-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-black/5 p-2.5 text-black dark:bg-white/10 dark:text-white">
              <Handshake size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-black dark:text-white">
                Socio Estratégico
              </h3>
              <div className="flex flex-col">
                 <span className="font-bold font-geist-mono text-black dark:text-white">$600 MXN / sesión</span>
                 <span className="text-[10px] uppercase tracking-wide text-black/40 dark:text-white/40">
                   * Primer diagnóstico GRATIS
                 </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-black opacity-40 dark:text-white">
                FORMACIÓN
              </p>
              <p className="text-xs font-medium leading-relaxed text-black/60 dark:text-white/60">
                Capacitación del equipo para maximizar productividad.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-black opacity-40 dark:text-white">
                EXPLORACIÓN
              </p>
              <p className="text-xs font-medium leading-relaxed text-black/60 dark:text-white/60">
                Análisis de procesos para descubrir automatizaciones.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-black opacity-40 dark:text-white">
                REFINAMIENTO
              </p>
              <p className="text-xs font-medium leading-relaxed text-black/60 dark:text-white/60">
                Optimización de créditos y mejor rendimiento mensual.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-sm font-bold uppercase tracking-widest text-black opacity-40 dark:text-white">
                VIGILANCIA
              </p>
              <p className="text-xs font-medium leading-relaxed text-black/60 dark:text-white/60">
                Roadmap estratégico para escalado eficiente.
              </p>
            </div>
          </div>

          <button className="mt-8 flex items-center gap-2 text-sm font-bold text-black transition-all hover:gap-3 dark:text-white">
            Agendar Consultoría
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Decor */}
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-black/[0.02] blur-[80px] dark:bg-white/[0.02]" />
      </div>

      {/* Enterprise */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#111] to-black p-8 text-white shadow-2xl lg:col-span-2 dark:from-[#111] dark:to-black">
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Building2 size={24} />
          </div>

          <h3 className="text-2xl font-bold tracking-tight">Plan ENTERPRISE</h3>
          <p className="mt-1 text-sm font-bold text-white/40">Comienza en $999 USD/mes</p>

          <div className="mt-8 flex-1 space-y-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/30">
               TU INFRAESTRUCTURA IDEAL
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Servidores Dedicados (Opcional)
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Límite de Workflows Personalizable
            </p>
            <p className="flex items-center gap-2 text-xs font-medium text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Personalización Completa del Entorno
            </p>
             <p className="mt-2 text-[10px] italic text-white/30">
               * Todo configurable según tus necesidades.
            </p>
          </div>

          <button className="mt-10 w-full rounded-xl bg-white py-3.5 font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98]">
            Contactar para Negociar
          </button>
        </div>

        {/* Abstract shape */}
        <div className="absolute -bottom-10 -right-10 h-40 w-40 animate-pulse rounded-full bg-white/10 blur-[60px]" />
      </div>
    </div>
  );
}
