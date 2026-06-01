'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send, ChevronDown, Check, CalendarDays, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSupportMutations } from '@/hooks/platform/use-support';
import { useAuth } from '@/hooks/identity/use-auth';
import Cal, { getCalApi } from '@calcom/embed-react';
import { CAL_CONFIG } from '@/config/cal';

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
    } catch (error) {
      toast.error(t('rateLimitError'));
    }
  };

  const handleSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    setIsDropdownOpen(false);
  };

  const isSubjectValid =
    selectedSubject && (selectedSubject !== t('subjectOther') || customSubject.trim().length > 0);

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
      <div className="p-6">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            {t('scheduleHeading')}
          </h1>
          <p className="text-text-secondary">{t('scheduleDesc')}</p>
        </div>
        <div className="h-[650px] overflow-hidden rounded-2xl border border-border shadow-sm">
          <Cal
            namespace={CAL_CONFIG.namespace}
            calLink={CAL_CONFIG.events.nuevoWorkflow}
            style={{ width: '100%', height: '100%', overflow: 'scroll' }}
            config={{
              layout: CAL_CONFIG.defaultLayout,
              ...(user?.name ? { name: user.name } : {}),
              ...(user?.email ? { email: user.email } : {}),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl p-6">
      {/* Page Header */}
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">{t('heading')}</h1>
        <p className="text-text-secondary">{t('description')}</p>
      </div>

      {/* Vertical layout: form top, calendar bottom */}
      <div className="flex flex-col gap-12">
        {/* TOP — Contact Form */}
        <div className="flex flex-col gap-4">
          {/* Section label */}
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">
              {t('sendMessageSection')}
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
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
        </div>

        {/* BOTTOM — Cal.com Calendar */}
        <div className="flex flex-col gap-4">
          {/* Section label */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">
              {t('scheduleSection')}
            </span>
          </div>

          <div className="h-[650px] overflow-hidden rounded-2xl border border-border shadow-sm">
            <Cal
              namespace={CAL_CONFIG.namespace}
              calLink={CAL_CONFIG.allEvents}
              style={{ width: '100%', height: '100%', overflow: 'scroll' }}
              config={{
                layout: CAL_CONFIG.defaultLayout,
                ...(user?.name ? { name: user.name } : {}),
                ...(user?.email ? { email: user.email } : {}),
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
