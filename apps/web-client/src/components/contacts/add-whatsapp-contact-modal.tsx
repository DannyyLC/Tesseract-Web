'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useEndUserMutations } from '@/hooks/identity/use-end-users';

interface AddWhatsappContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Solo para validar en el cliente, sin importar el `+` u otro formato: código de país (2
 * dígitos) + número (10 dígitos). Igual que `@Matches` en `CreateEndUserDto` del gateway.
 */
const PHONE_DIGITS_PATTERN = /^\d{2}\d{10}$/;

/**
 * Alta manual de un contacto de WhatsApp, identificado solo por su número.
 *
 * El servidor normaliza el número a `+dígitos` (ver `normalizePhone()` en el gateway), la misma
 * forma en la que vive `EndUser.phoneNumber` una vez que esa persona escribe de verdad: sin esa
 * normalización compartida, un contacto dado de alta a mano nunca haría match con su mensaje.
 */
export function AddWhatsappContactModal({ isOpen, onClose }: AddWhatsappContactModalProps) {
  const t = useTranslations('Contacts');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { createEndUser } = useEndUserMutations();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhoneNumber('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const digits = phoneNumber.replace(/\D/g, '');

    if (!PHONE_DIGITS_PATTERN.test(digits)) {
      setError(t('addWhatsappInvalidPhone'));
      return;
    }

    setError(null);

    try {
      // El servidor es quien normaliza a `+dígitos` (`NormalizePhone()`); aquí solo se valida
      // la cantidad de dígitos, así que se manda el número tal como se escribió.
      await createEndUser.mutateAsync({
        phoneNumber: phoneNumber.trim(),
        name: name.trim() || undefined,
      });
      toast.success(t('addWhatsappSuccess'));
      onClose();
    } catch (err: any) {
      const statusCode = err?.response?.status;
      const backendMessage = typeof err?.message === 'string' ? err.message : '';

      if (statusCode === 409) {
        setError(backendMessage || t('addWhatsappDuplicate'));
        return;
      }

      toast.error(backendMessage || t('addWhatsappError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('addWhatsappModalTitle')}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-surface-secondary p-3">
          <Phone size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-whatsapp)' }} />
          <p className="text-sm text-text-secondary">{t('addWhatsappDescription')}</p>
        </div>

        <div>
          <label htmlFor="whatsapp-name" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t('addWhatsappNameLabel')}
          </label>
          <input
            id="whatsapp-name"
            type="text"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit();
            }}
            maxLength={200}
            placeholder={t('addWhatsappNamePlaceholder')}
            className="focus:ring-border-focus/10 w-full rounded-xl border-none bg-surface-secondary px-4 py-2.5 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
          />
        </div>

        <div>
          <label htmlFor="whatsapp-phone" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t('addWhatsappPhoneLabel')}
          </label>
          <input
            id="whatsapp-phone"
            type="tel"
            value={phoneNumber}
            onChange={(event) => {
              setPhoneNumber(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit();
            }}
            placeholder={t('addWhatsappPhonePlaceholder')}
            className="focus:ring-border-focus/10 w-full rounded-xl border-none bg-surface-secondary px-4 py-2.5 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
          />
          {error ? (
            <p className="mt-1 text-xs font-medium text-danger">{error}</p>
          ) : (
            <p className="mt-1 text-xs text-text-tertiary">{t('addWhatsappPhoneHint')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={createEndUser.isPending}
            className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={createEndUser.isPending}
            className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-whatsapp)' }}
          >
            {createEndUser.isPending && <Loader2 size={14} className="animate-spin" />}
            {t('addWhatsappSubmit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
