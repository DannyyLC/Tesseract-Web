'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send, ChevronDown, Check, CalendarDays, Mail } from 'lucide-react';
import { useSupportMutations } from '@/hooks/useSupport';
import { useAuth } from '@/hooks/useAuth';
import Cal, { getCalApi } from '@calcom/embed-react';
import { CAL_CONFIG } from '@/config/cal';

const SUBJECT_OPTIONS = [
  'Consultoría y Estrategia',
  'Implementación de nuevo Workflow',
  'Asistencia para contratación de plan',
  'Dudas Generales',
  'Problemas con mi cuenta o acceso',
  'Facturación y Pagos',
  'Reporte de fallos (Bug)',
  'Otro'
];

function SupportContent() {
  const searchParams = useSearchParams();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: user } = useAuth();

  const { requestServiceInfo } = useSupportMutations();
  
  const reason = searchParams.get('reason');
  const initialSubject = reason === 'upgrade' ? 'Asistencia para contratación de plan' : '';

  const [selectedSubject, setSelectedSubject] = useState(initialSubject);
  const [customSubject, setCustomSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (reason === 'upgrade') {
      setSelectedSubject('Asistencia para contratación de plan');
    }
  }, [reason]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalSubject = selectedSubject === 'Otro' ? customSubject : selectedSubject;

    if (!finalSubject) {
      toast.error('Por favor selecciona un asunto.');
      return;
    }

    try {
      await requestServiceInfo.mutateAsync({
        subject: finalSubject,
        userMsg: message || undefined,
      });
      toast.success('Mensaje enviado correctamente. Nos pondremos en contacto contigo pronto.');
      setSelectedSubject('');
      setCustomSubject('');
      setMessage('');
    } catch (error) {
      toast.error('Espera un poco e intenta de nuevo.');
    }
  };

  const handleSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    setIsDropdownOpen(false);
  };

  const isSubjectValid = selectedSubject && (selectedSubject !== 'Otro' || customSubject.trim().length > 0);

  // Initialize Cal.com embed
  useEffect(() => {
    (async function () {
      const cal = await getCalApi({ namespace: CAL_CONFIG.namespace });
      cal('ui', {
        hideEventTypeDetails: false,
        layout: CAL_CONFIG.defaultLayout,
      });
    })();
  }, []);

  const isNuevoWorkflow = reason === 'nuevo-workflow';

  if (isNuevoWorkflow) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-white">
            Agenda tu Reunión
          </h1>
          <p className="text-black/60 dark:text-white/60">
            ¡Solicitud enviada! Para comenzar a diseñar tu automatización, por favor selecciona el horario que mejor te acomode para nuestra primera reunión técnica.
          </p>
        </div>
        <div className="h-[650px] overflow-hidden rounded-2xl border border-black/5 shadow-sm dark:border-white/5">
          <Cal
            namespace={CAL_CONFIG.namespace}
            calLink={CAL_CONFIG.events.nuevoWorkflow}
            style={{ width: '100%', height: '100%', overflow: 'scroll' }}
            config={{ 
              layout: CAL_CONFIG.defaultLayout,
              ...(user?.name ? { name: user.name } : {}),
              ...(user?.email ? { email: user.email } : {})
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">

      {/* Page Header */}
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-white">
          Centro de Soporte
        </h1>
        <p className="text-black/60 dark:text-white/60">
          Contáctanos por mensaje o agenda una sesión directamente en tu horario preferido.
        </p>
      </div>

      {/* Vertical layout: form top, calendar bottom */}
      <div className="flex flex-col gap-12">

        {/* TOP — Contact Form */}
        <div className="flex flex-col gap-4">
          {/* Section label */}
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-black/40 dark:text-white/40" />
            <span className="text-sm font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
              Enviar Mensaje
            </span>
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0A0A0A] md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

              <div className="space-y-2">
                <label htmlFor="subject" className="text-sm font-medium text-black dark:text-white">
                  Asunto
                </label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`flex w-full items-center justify-between rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm transition-all hover:bg-black/5 focus:border-black focus:ring-1 focus:ring-black dark:border-white/10 dark:hover:bg-white/5 dark:focus:border-white dark:focus:ring-white ${
                      isDropdownOpen ? 'border-black ring-1 ring-black dark:border-white dark:ring-white' : ''
                    }`}
                  >
                    <span className={selectedSubject ? 'text-black dark:text-white' : 'text-black/30 dark:text-white/30'}>
                      {selectedSubject || 'Selecciona un asunto'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-black/30 transition-transform duration-200 dark:text-white/30 ${
                        isDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg dark:border-white/5 dark:bg-[#141414]">
                      <div className="p-1">
                        {SUBJECT_OPTIONS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleSubjectSelect(option)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              selectedSubject === option
                                ? 'bg-black/5 font-medium text-black dark:bg-white/5 dark:text-white'
                                : 'text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5'
                            }`}
                          >
                            <span className="truncate pr-2">{option}</span>
                            {selectedSubject === option && (
                              <Check className="h-4 w-4 shrink-0 text-black dark:text-white" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedSubject === 'Otro' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label htmlFor="customSubject" className="text-sm font-medium text-black dark:text-white">
                    Especificar Asunto
                  </label>
                  <input
                    id="customSubject"
                    type="text"
                    required
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Escribe el asunto..."
                    className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-black/30 focus:border-black focus:ring-1 focus:ring-black dark:border-white/10 dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-black dark:text-white">
                  Mensaje <span className="text-black/30 dark:text-white/30 font-normal">(Opcional)</span>
                </label>
                <textarea
                  id="message"
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe tu consulta o problema..."
                  className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-black/30 focus:border-black focus:ring-1 focus:ring-black dark:border-white/10 dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
                />
              </div>

              <button
                type="submit"
                disabled={requestServiceInfo.isPending || !isSubjectValid}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3 text-sm font-bold text-white transition-all hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                {requestServiceInfo.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar Mensaje
              </button>
            </form>
          </div>
        </div>

        {/* BOTTOM — Cal.com Calendar */}
        <div className="flex flex-col gap-4">
          {/* Section label */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-black/40 dark:text-white/40" />
            <span className="text-sm font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
              Agendar una Cita
            </span>
          </div>

          <div className="h-[650px] overflow-hidden rounded-2xl border border-black/5 shadow-sm dark:border-white/5">
            <Cal
              namespace={CAL_CONFIG.namespace}
              calLink={CAL_CONFIG.allEvents}
              style={{ width: '100%', height: '100%', overflow: 'scroll' }}
              config={{ 
                layout: CAL_CONFIG.defaultLayout,
                ...(user?.name ? { name: user.name } : {}),
                ...(user?.email ? { email: user.email } : {})
              }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/20 dark:text-white/20" />
      </div>
    }>
      <SupportContent />
    </Suspense>
  );
}
