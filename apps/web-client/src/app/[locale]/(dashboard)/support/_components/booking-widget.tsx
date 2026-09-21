'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, Video } from 'lucide-react';
import { BookingConfirmation, BookingEventTypeId } from '@tesseract/types';
import {
  useBookingAvailability,
  useBookingEventTypes,
  useCreateBooking,
} from '@/hooks/platform/use-booking';

interface BookingWidgetProps {
  /** Si se fija, se salta el paso de elegir tipo de sesión y se reserva directo ese tipo. */
  fixedEventTypeId?: BookingEventTypeId;
  attendeeName?: string;
  attendeeEmail?: string;
}

type Step = 'select-type' | 'select-slot' | 'form' | 'success';

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Celdas de la grilla mensual, semana de lunes a domingo, con relleno de meses vecinos. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);

  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function BookingWidget({ fixedEventTypeId, attendeeName, attendeeEmail }: BookingWidgetProps) {
  const t = useTranslations('Support');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const { data: eventTypes, isLoading: loadingEventTypes } = useBookingEventTypes();
  const createBooking = useCreateBooking();

  const [step, setStep] = useState<Step>(fixedEventTypeId ? 'select-slot' : 'select-type');
  const [eventTypeId, setEventTypeId] = useState<BookingEventTypeId | undefined>(fixedEventTypeId);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState(attendeeName ?? '');
  const [notes, setNotes] = useState('');
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const selectedDateKey = selectedDate ? dateKey(selectedDate) : undefined;
  const { data: availability, isLoading: loadingSlots } = useBookingAvailability(
    eventTypeId,
    selectedDateKey,
  );

  const selectedEventType = eventTypes?.find((e) => e.id === eventTypeId);
  const today = useMemo(() => new Date(), []);
  const maxAdvanceDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);
  const monthGrid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const canGoPrevMonth = startOfMonth(today).getTime() < visibleMonth.getTime();

  const weekdayLabels = useMemo(() => {
    // 2024-01-01 fue lunes: base estable para nombrar la fila de encabezados sin nueva copia i18n.
    const monday = new Date(2024, 0, 1);
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return formatter.format(d);
    });
  }, [locale]);

  const resetAll = () => {
    setStep(fixedEventTypeId ? 'select-slot' : 'select-type');
    setEventTypeId(fixedEventTypeId);
    setSelectedDate(null);
    setSelectedSlot(null);
    setNotes('');
    setConfirmation(null);
  };

  const handleSubmit = async () => {
    if (!eventTypeId || !selectedSlot) return;

    try {
      const result = await createBooking.mutateAsync({
        eventTypeId,
        startTime: selectedSlot,
        attendeeName: name,
        notes: notes || undefined,
      });
      setConfirmation(result);
      setStep('success');
    } catch (error: any) {
      if (error?.response?.status === 400) {
        toast.error(t('booking.bookingErrorSlotTaken'));
        queryClient.invalidateQueries({ queryKey: ['booking', 'availability', eventTypeId, selectedDateKey] });
        setSelectedSlot(null);
        setStep('select-slot');
      } else {
        toast.error(t('booking.bookingErrorGeneric'));
      }
    }
  };

  if (step === 'success' && confirmation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
          <Check className="h-7 w-7 text-success" />
        </div>
        <h3 className="text-xl font-bold text-text-primary">{t('booking.successHeading')}</h3>
        <p className="max-w-sm text-sm text-text-secondary">{t('booking.successDesc')}</p>
        <p className="text-sm font-medium text-text-primary">
          {new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(confirmation.startTime))}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {confirmation.meetLink && (
            <a
              href={confirmation.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-text-inverse transition-all hover:bg-accent-hover"
            >
              <Video className="h-4 w-4" />
              {t('booking.joinMeetButton')}
            </a>
          )}
          <a
            href={confirmation.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-surface-secondary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('booking.viewInCalendarButton')}
          </a>
        </div>
        <button
          type="button"
          onClick={resetAll}
          className="mt-2 text-sm font-medium text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline"
        >
          {t('booking.bookAnotherButton')}
        </button>
      </div>
    );
  }

  if (step === 'select-type') {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <h3 className="text-base font-semibold text-text-primary">
          {t('booking.selectEventTypeHeading')}
        </h3>
        {loadingEventTypes ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {eventTypes?.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setEventTypeId(type.id);
                  setStep('select-slot');
                }}
                className="flex flex-col items-start gap-1 rounded-xl border border-border p-4 text-left transition-all hover:border-border-hover hover:bg-surface-secondary"
              >
                <span className="font-medium text-text-primary">{type.title}</span>
                <span className="text-sm text-text-secondary">{type.description}</span>
                <span className="text-xs font-medium text-text-tertiary">
                  {type.durationMinutes} {t('booking.minutesSuffix')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => setStep('select-slot')}
          className="flex w-fit items-center gap-1 text-sm text-text-tertiary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('booking.backButton')}
        </button>

        {selectedEventType && selectedSlot && (
          <div className="rounded-xl border border-border bg-surface-secondary p-4 text-sm">
            <p className="font-medium text-text-primary">{selectedEventType.title}</p>
            <p className="text-text-secondary">
              {new Intl.DateTimeFormat(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(selectedSlot))}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">{t('booking.nameLabel')}</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm outline-none transition-all focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">{t('booking.emailLabel')}</label>
            <p className="rounded-xl border border-border bg-surface-secondary px-4 py-2.5 text-sm text-text-secondary">
              {attendeeEmail}
            </p>
            <p className="text-xs text-text-tertiary">{t('booking.emailHint')}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">
              {t('booking.notesLabel')} <span className="font-normal text-text-tertiary">{t('optional')}</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('booking.notesPlaceholder')}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-input-placeholder focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!name || createBooking.isPending}
          onClick={handleSubmit}
          className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-text-inverse transition-all hover:bg-accent-hover disabled:opacity-50"
        >
          {createBooking.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {createBooking.isPending ? t('booking.confirmingButton') : t('booking.confirmButton')}
        </button>
      </div>
    );
  }

  // step === 'select-slot'
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-2">
      <div className="flex flex-col gap-3 border-b border-border p-6 md:border-b-0 md:border-r">
        {!fixedEventTypeId && selectedEventType && (
          <button
            type="button"
            onClick={() => setStep('select-type')}
            className="flex w-fit items-center gap-1 text-sm text-text-tertiary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('booking.changeType')}
          </button>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{t('booking.selectDateLabel')}</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canGoPrevMonth}
              onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-text-tertiary transition-all hover:bg-surface-secondary disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7rem] text-center text-sm font-medium text-text-primary">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visibleMonth)}
            </span>
            <button
              type="button"
              onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-text-tertiary transition-all hover:bg-surface-secondary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-text-tertiary">
          {weekdayLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((day, i) => {
            const inMonth = day.getMonth() === visibleMonth.getMonth();
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const isPast = day < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const isTooFar = day > maxAdvanceDate;
            const disabled = !inMonth || isWeekend || isPast || isTooFar;
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedDate(day);
                  setSelectedSlot(null);
                }}
                className={`aspect-square rounded-lg text-sm transition-all ${
                  !inMonth ? 'text-text-tertiary/30' : ''
                } ${
                  disabled
                    ? 'cursor-not-allowed text-text-tertiary/40'
                    : isSelected
                      ? 'bg-accent text-text-inverse hover:bg-accent'
                      : 'text-text-primary hover:bg-surface-secondary'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-6">
        <h3 className="text-sm font-semibold text-text-primary">{t('booking.selectTimeLabel')}</h3>
        {!selectedDate ? (
          <p className="text-sm text-text-tertiary">{t('booking.pickDayPrompt')}</p>
        ) : loadingSlots ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          </div>
        ) : !availability?.slots.length ? (
          <p className="text-sm text-text-tertiary">{t('booking.noSlotsForDay')}</p>
        ) : (
          <>
            <p className="text-xs text-text-tertiary">{t('booking.timezoneNote')}</p>
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {availability.slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setStep('form');
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary transition-all hover:border-border-hover hover:bg-surface-secondary"
                >
                  {new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
                    new Date(slot),
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
