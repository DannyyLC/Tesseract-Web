'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { deleteAtPath, setAtPath, type WorkflowConfig } from '@/lib/workflow-config/config-edit';
import { inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
}

const MESSAGE_FIELDS: [string, string][] = [
  ['audioDisabled', 'messageAudioDisabled'],
  ['audioTooLong', 'messageAudioTooLong'],
  ['audioFailed', 'messageAudioFailed'],
  ['imageDisabled', 'messageImageDisabled'],
  ['imageTooLarge', 'messageImageTooLarge'],
  ['videoDisabled', 'messageVideoDisabled'],
  ['unsupportedFormat', 'messageUnsupportedFormat'],
];

/**
 * `mediaProcessing` viene apagado por defecto: transcribir cuesta dinero y debe ser
 * opt-in explícito por cliente.
 */
export function MediaTab({ config, onChange }: Props) {
  const t = useTranslations('Admin.MediaTab');
  const media = config.mediaProcessing ?? {};

  const set = (path: (string | number)[], value: unknown) =>
    onChange(setAtPath(config, ['mediaProcessing', ...path], value));

  return (
    <div className="space-y-5">
      <p className="text-xs text-text-secondary">{t('intro')}</p>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <Switch
          checked={!!media.audio?.enabled}
          onChange={(v) => set(['audio', 'enabled'], v)}
          label={t('audioLabel')}
          hint={t('audioHint')}
        />
        {media.audio?.enabled && (
          <div className="pl-11">
            <label className={labelClass}>{t('maxDurationLabel')}</label>
            <input
              type="number"
              className={`${inputClass} max-w-[200px]`}
              value={media.audio?.maxSeconds ?? ''}
              onChange={(e) =>
                e.target.value === ''
                  ? onChange(deleteAtPath(config, ['mediaProcessing', 'audio', 'maxSeconds']))
                  : set(['audio', 'maxSeconds'], Number(e.target.value))
              }
            />
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <Switch
          checked={!!media.image?.enabled}
          onChange={(v) => set(['image', 'enabled'], v)}
          label={t('imageLabel')}
          hint={t('imageHint')}
        />
        {media.image?.enabled && (
          <div className="space-y-3 pl-11">
            <div>
              <label className={labelClass}>{t('maxSizeLabel')}</label>
              <input
                type="number"
                className={`${inputClass} max-w-[240px]`}
                value={media.image?.maxBytes ?? ''}
                onChange={(e) =>
                  e.target.value === ''
                    ? onChange(deleteAtPath(config, ['mediaProcessing', 'image', 'maxBytes']))
                    : set(['image', 'maxBytes'], Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className={labelClass}>ocrPrompt</label>
              <textarea
                rows={3}
                className={inputClass}
                value={media.ocrPrompt ?? ''}
                onChange={(e) => set(['ocrPrompt'], e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <Switch
          checked={!!media.video?.enabled}
          onChange={(v) => set(['video', 'enabled'], v)}
          label={t('videoLabel')}
        />
      </div>

      {/* Encendido por defecto: solo se guarda la excepción (`false`), así la config de los
          workflows que no la usan no cambia. */}
      <div className="rounded-lg border border-border p-4">
        <Switch
          checked={config.presenceIndicators !== false}
          onChange={(v) =>
            onChange(
              v
                ? deleteAtPath(config, ['presenceIndicators'])
                : setAtPath(config, ['presenceIndicators'], false),
            )
          }
          label={t('presenceLabel')}
          hint={t('presenceHint')}
        />
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-text-primary">
          {t('userMessagesSummary')}
        </summary>
        <div className="mt-3 space-y-3">
          {MESSAGE_FIELDS.map(([key, labelKey]) => (
            <div key={key}>
              <label className={labelClass}>
                {t(labelKey)} <span className="font-mono font-normal">({key})</span>
              </label>
              <input
                className={inputClass}
                value={media.messages?.[key] ?? ''}
                placeholder={t('defaultMessagePlaceholder')}
                onChange={(e) =>
                  e.target.value === ''
                    ? onChange(deleteAtPath(config, ['mediaProcessing', 'messages', key]))
                    : set(['messages', key], e.target.value)
                }
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
