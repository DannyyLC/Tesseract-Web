'use client';

import { deleteAtPath, setAtPath, type WorkflowConfig } from '@/lib/workflow-config/config-edit';
import { inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
}

const MESSAGE_FIELDS: [string, string][] = [
  ['audioDisabled', 'Audio no habilitado'],
  ['audioTooLong', 'Audio demasiado largo'],
  ['audioFailed', 'Falló la transcripción'],
  ['imageDisabled', 'Imagen no habilitada'],
  ['imageTooLarge', 'Imagen demasiado grande'],
  ['videoDisabled', 'Video no habilitado'],
  ['unsupportedFormat', 'Formato no soportado'],
];

/**
 * `mediaProcessing` viene apagado por defecto: transcribir cuesta dinero y debe ser
 * opt-in explícito por cliente.
 */
export function MediaTab({ config, onChange }: Props) {
  const media = config.mediaProcessing ?? {};

  const set = (path: (string | number)[], value: unknown) =>
    onChange(setAtPath(config, ['mediaProcessing', ...path], value));

  const Toggle = ({
    checked,
    onToggle,
    label,
  }: {
    checked: boolean;
    onToggle: (v: boolean) => void;
    label: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onToggle(!checked)}
      className="flex items-center gap-2"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-secondary border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="text-sm text-text-primary">{label}</span>
    </button>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-xs text-text-secondary">
        Todo empieza apagado: procesar media consume créditos, así que se habilita por cliente.
      </p>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <Toggle
          checked={!!media.audio?.enabled}
          onToggle={(v) => set(['audio', 'enabled'], v)}
          label="Procesar audio (transcripción)"
        />
        {media.audio?.enabled && (
          <div className="pl-11">
            <label className={labelClass}>Duración máxima (segundos)</label>
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
        <Toggle
          checked={!!media.image?.enabled}
          onToggle={(v) => set(['image', 'enabled'], v)}
          label="Procesar imágenes (OCR / visión)"
        />
        {media.image?.enabled && (
          <div className="space-y-3 pl-11">
            <div>
              <label className={labelClass}>Tamaño máximo (bytes)</label>
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
        <Toggle
          checked={!!media.video?.enabled}
          onToggle={(v) => set(['video', 'enabled'], v)}
          label="Procesar video"
        />
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-text-primary">
          Mensajes al usuario
        </summary>
        <div className="mt-3 space-y-3">
          {MESSAGE_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className={labelClass}>
                {label} <span className="font-mono font-normal">({key})</span>
              </label>
              <input
                className={inputClass}
                value={media.messages?.[key] ?? ''}
                placeholder="(usa el mensaje por defecto)"
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
