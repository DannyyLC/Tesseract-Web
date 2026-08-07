'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/** Longitud de un código de respaldo ya formateado: `XXXXX-XXXXX`. */
const BACKUP_CODE_LENGTH = 11;
const TOTP_LENGTH = 6;

interface TwoFactorCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Se dispara al pulsar Enter con un código de longitud completa. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Estilo del input. `auth` es la variante de pantalla completa; `modal`, la de los diálogos. */
  variant?: 'auth' | 'modal';
  /** Oculta el enlace para cambiar a código de respaldo (p.ej. al dar de alta el 2FA). */
  allowBackupCode?: boolean;
  label?: string;
}

const VARIANT_CLASSES = {
  auth: 'w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3 text-center font-mono text-2xl tracking-widest text-text-primary outline-none focus:border-input-border-focus',
  modal:
    'focus:ring-border-focus/5 w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-input-border-focus focus:ring-4',
};

/**
 * Input del segundo factor, con dos modos.
 *
 * Existe porque los dos formatos no toleran la misma sanitización: el TOTP es
 * numérico, pero un código de respaldo es alfanumérico y el clásico
 * `replace(/\D/g,'')` lo borraría entero. Encapsular ambos modos aquí evita
 * repetir el mismo interruptor en las seis pantallas que piden código.
 */
export const TwoFactorCodeInput = ({
  value,
  onChange,
  onSubmit,
  autoFocus = false,
  variant = 'modal',
  allowBackupCode = true,
  label,
}: TwoFactorCodeInputProps) => {
  const t = useTranslations('TwoFactorCodeInput');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const maxLength = useBackupCode ? BACKUP_CODE_LENGTH : TOTP_LENGTH;

  const sanitize = (raw: string) =>
    useBackupCode
      ? raw
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .slice(0, 10)
          // Se reinserta el guion para que se lea igual que en la hoja de códigos
          .replace(/^(.{5})(.+)$/, '$1-$2')
      : raw.replace(/\D/g, '').slice(0, TOTP_LENGTH);

  const isComplete = value.length === maxLength;

  const toggleMode = () => {
    setUseBackupCode((previous) => !previous);
    onChange('');
  };

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-text-primary">{label}</label>}

      <input
        type="text"
        inputMode={useBackupCode ? 'text' : 'numeric'}
        autoComplete={useBackupCode ? 'off' : 'one-time-code'}
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(sanitize(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isComplete) onSubmit?.();
        }}
        placeholder={useBackupCode ? 'XXXXX-XXXXX' : '000000'}
        className={VARIANT_CLASSES[variant]}
      />

      {allowBackupCode && (
        <button
          type="button"
          onClick={toggleMode}
          className="text-xs text-text-secondary underline transition-colors hover:text-text-primary"
        >
          {useBackupCode ? t('useAuthenticator') : t('useBackupCode')}
        </button>
      )}
    </div>
  );
};

/** Longitud completa según el modo, para que quien consuma sepa cuándo habilitar el submit. */
export const isTwoFactorCodeComplete = (code: string) =>
  code.length === TOTP_LENGTH || code.length === BACKUP_CODE_LENGTH;
