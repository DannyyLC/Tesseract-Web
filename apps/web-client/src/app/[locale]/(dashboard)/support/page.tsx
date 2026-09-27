'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  Send,
  ChevronDown,
  Check,
  CalendarDays,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useSupportMutations } from '@/hooks/platform/use-support';
import { useAuth } from '@/hooks/identity/use-auth';
import { BookingWidget } from './_components/booking-widget';

type SupportTab = 'message' | 'schedule';

const SUPPORT_TABS = [
  { id: 'message', icon: Mail, labelKey: 'sendMessageSection' },
  { id: 'schedule', icon: CalendarDays, labelKey: 'scheduleSection' },
] as const satisfies readonly { id: SupportTab; icon: LucideIcon; labelKey: string }[];

// Alto mínimo y no fijo: los pasos del widget miden distinto (fecha, horarios, datos,
// confirmación) y los que se centran verticalmente necesitan algo de caja.
const BOOKING_FRAME = 'min-h-[520px] overflow-hidden rounded-2xl border border-border';

function SupportContent() {
  const t = useTranslations('Support');
  const searchParams = useSearchParams();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: user } = useAuth();

  const { requestServiceInfo } = useSupportMutations();

  const SUBJECT_OPTIONS = [
    t('subjectConsultancy'),
    t('subjectNewWorkflow'),
    t('subjectPlanAssistance'),
    t('subjectGeneralQuestions'),
    t('subjectAccountIssues'),
    t('subjectBillingPayments'),
    t('subjectBugReport'),
    t('subjectOther'),
  ];

  const reason = searchParams.get('reason');
  const initialSubject = reason === 'upgrade' ? t('subjectPlanAssistance') : '';

  const [selectedSubject, setSelectedSubject] = useState(initialSubject);
  const [customSubject, setCustomSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (reason === 'upgrade') {
      setSelectedSubject(t('subjectPlanAssistance'));
    }
  }, [reason, t]);

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

    const finalSubject = selectedSubject === t('subjectOther') ? customSubject : selectedSubject;

    if (!finalSubject) {
      toast.error(t('selectSubjectError'));
      return;
    }

    try {
      await requestServiceInfo.mutateAsync({
        subject: finalSubject,
        userMsg: message || undefined,
      });
      toast.success(t('messageSentSuccess'));
      setSelectedSubject('');
      setCustomSubject('');
      setMessage('');
    } catch {
      toast.error(t('rateLimitError'));
    }
  };

  const handleSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    setIsDropdownOpen(false);
  };

  const isSubjectValid =
    selectedSubject && (selectedSubject !== t('subjectOther') || customSubject.trim().length > 0);

  const isNuevoWorkflow = reason === 'nuevo-workflow';

  // Mensaje y cita son alternativas, no pasos: se elige una y se muestra solo esa. `?tab=schedule`
  // permite enlazar directo al calendario.
  const [activeTab, setActiveTab] = useState<SupportTab>(
    searchParams.get('tab') === 'schedule' ? 'schedule' : 'message',
  );

  if (isNuevoWorkflow) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('scheduleHeading')}</h1>
          <p className="mt-1 text-text-secondary">{t('scheduleDesc')}</p>
        </div>
        <div className={BOOKING_FRAME}>
          <BookingWidget
            fixedEventTypeId="nuevo-workflow"
            attendeeName={user?.name}
            attendeeEmail={user?.email}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
        <p className="mt-1 text-text-secondary">{t('description')}</p>
      </div>

      {/* Interruptor de dos posiciones: segmentos del mismo ancho y una píldora que se desliza a
          la opción activa, para que se lea como "uno u otro" y no como dos botones sueltos. */}
      <div
        role="tablist"
        className="relative grid w-full grid-cols-2 rounded-full bg-surface-secondary p-1 sm:w-auto sm:min-w-[24rem] sm:max-w-md"
      >
        {SUPPORT_TABS.map(({ id, icon: Icon, labelKey }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                isActive ? 'text-text-inverse' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="support-tab-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  className="absolute inset-0 rounded-full bg-accent shadow-sm"
                />
              )}
              <Icon className="relative h-3.5 w-3.5" />
              <span className="relative">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'message' ? (
        <div className="rounded-2xl border border-border p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium text-text-primary">
                {t('subjectLabel')}
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`flex w-full items-center justify-between rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm transition-all hover:bg-surface-secondary focus:border-border-focus focus:ring-1 focus:ring-border-focus ${
                    isDropdownOpen ? 'border-border-focus ring-1 ring-border-focus' : ''
                  }`}
                >
                  <span className={selectedSubject ? 'text-text-primary' : 'text-text-tertiary'}>
                    {selectedSubject || t('selectSubjectPlaceholder')}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-text-tertiary transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface-panel shadow-lg">
                    <div className="p-1">
                      {SUBJECT_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleSubjectSelect(option)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            selectedSubject === option
                              ? 'bg-surface-secondary font-medium text-text-primary'
                              : 'text-text-secondary hover:bg-surface-secondary'
                          }`}
                        >
                          <span className="truncate pr-2">{option}</span>
                          {selectedSubject === option && (
                            <Check className="h-4 w-4 shrink-0 text-text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedSubject === t('subjectOther') && (
              <div className="animate-in fade-in slide-in-from-top-2 space-y-2 duration-200">
                <label htmlFor="customSubject" className="text-sm font-medium text-text-primary">
                  {t('customSubjectLabel')}
                </label>
                <input
                  id="customSubject"
                  type="text"
                  required
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder={t('customSubjectPlaceholder')}
                  className="w-full rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-input-placeholder focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-text-primary">
                {t('messageLabel')}{' '}
                <span className="font-normal text-text-tertiary">{t('optional')}</span>
              </label>
              <textarea
                id="message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('messagePlaceholder')}
                className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-input-placeholder focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              />
            </div>

            <button
              type="submit"
              disabled={requestServiceInfo.isPending || !isSubjectValid}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-all hover:bg-accent-hover disabled:opacity-50"
            >
              {requestServiceInfo.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('sendButton')}
            </button>
          </form>
        </div>
      ) : (
        <div className={BOOKING_FRAME}>
          <BookingWidget attendeeName={user?.name} attendeeEmail={user?.email} />
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
        </div>
      }
    >
      <SupportContent />
    </Suspense>
  );
}
