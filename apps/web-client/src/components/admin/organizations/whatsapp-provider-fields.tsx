'use client';

import { useTranslations } from 'next-intl';
import { inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import type { WhatsappProvider } from '@/lib/api/endpoints/messaging/whatsapp-config/whatsapp-config-admin-api';

export interface WhatsappProviderValue {
  provider: WhatsappProvider;
  // Solo Meta: viajan al backend y terminan en `sessionData`. Nunca se leen de vuelta.
  phoneNumberId: string;
  appSecret: string;
  accessToken: string;
}

export const EMPTY_PROVIDER_VALUE: WhatsappProviderValue = {
  provider: 'ycloud',
  phoneNumberId: '',
  appSecret: '',
  accessToken: '',
};

export function isProviderValueComplete(v: WhatsappProviderValue): boolean {
  return (
    v.provider !== 'meta' ||
    (v.phoneNumberId.trim() !== '' && v.appSecret.trim() !== '' && v.accessToken.trim() !== '')
  );
}

/** Los campos de Meta solo viajan con `provider: 'meta'`; con YCloud el backend los ignoraría igual. */
export function toProviderPayload(v: WhatsappProviderValue) {
  return {
    provider: v.provider,
    ...(v.provider === 'meta' && {
      phoneNumberId: v.phoneNumberId.trim(),
      appSecret: v.appSecret.trim(),
      accessToken: v.accessToken.trim(),
    }),
  };
}

interface Props {
  value: WhatsappProviderValue;
  onChange: (value: WhatsappProviderValue) => void;
}

/** Selector de proveedor y, para Meta, sus credenciales. Compartido por los dos formularios de alta. */
export function WhatsappProviderFields({ value, onChange }: Props) {
  const t = useTranslations('Admin.ChannelsTab');
  const set = (patch: Partial<WhatsappProviderValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <div>
        <label className={labelClass}>{t('providerLabel')}</label>
        <select
          className={inputClass}
          value={value.provider}
          onChange={(e) => set({ provider: e.target.value as WhatsappProvider })}
        >
          <option value="ycloud">{t('providerYcloud')}</option>
          <option value="meta">{t('providerMeta')}</option>
        </select>
      </div>

      {value.provider === 'meta' && (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <p className="text-xs text-text-secondary">{t('metaCredentialsHint')}</p>
          <div>
            <label className={labelClass}>{t('metaPhoneNumberIdLabel')}</label>
            <input
              className={inputClass}
              value={value.phoneNumberId}
              onChange={(e) => set({ phoneNumberId: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>{t('metaAppSecretLabel')}</label>
            <input
              className={inputClass}
              type="password"
              value={value.appSecret}
              onChange={(e) => set({ appSecret: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={labelClass}>{t('metaAccessTokenLabel')}</label>
            <input
              className={inputClass}
              type="password"
              value={value.accessToken}
              onChange={(e) => set({ accessToken: e.target.value })}
              autoComplete="new-password"
            />
          </div>
        </div>
      )}
    </>
  );
}
