'use client';

import PermissionGuard from '@/components/auth/permission-guard';
import { useWhatsappMutations, useWhatsappNumbers } from '@/hooks/messaging/use-whatsapp-config';
import { Link, useRouter } from '@/i18n/routing';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** Mismo estilo de campo que el resto de pantallas de canal. */
const INPUT_CLASSES =
  'w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-border-focus focus:bg-surface';

export default function WorkflowWhatsappEditPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const configId = params.configId as string;
  const t = useTranslations('WhatsappChannelEdit');
  const router = useRouter();

  // La lista del workflow ya está en caché desde el detalle, así que abrir la edición
  // no dispara una consulta nueva; entrar por URL directa la resuelve igual.
  const { data: numbers, isLoading } = useWhatsappNumbers(workflowId);
  const config = numbers?.find((number) => number.id === configId);

  const { updateWhatsappConfiguration } = useWhatsappMutations();

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!config) return;
    setDisplayName(config.displayName ?? '');
    setDescription(config.description ?? '');
  }, [config]);

  const handleSave = async () => {
    try {
      await updateWhatsappConfiguration.mutateAsync({
        id: configId,
        displayName: displayName.trim(),
        description: description.trim(),
      });

      toast.success(t('updateSuccess'));
      router.push(`/workflows/${workflowId}`);
    } catch (error: any) {
      const backendMessage =
        (typeof error?.response?.data?.message === 'string' &&
          error.response.data.message.trim()) ||
        (typeof error?.message === 'string' && error.message.trim()) ||
        t('updateError');

      toast.error(backendMessage);
      console.error(error);
    }
  };

  return (
    <PermissionGuard permissions="workflows:update" redirect={true} fallbackRoute="/workflows">
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="w-full space-y-8 px-6 py-8">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div className="flex w-full items-start gap-4 md:w-auto">
                <Link
                  href={`/workflows/${workflowId}`}
                  className="group -ml-2 mt-1 shrink-0 rounded-full p-2 text-text-tertiary transition-all hover:bg-[var(--surface-tint)]"
                >
                  <ArrowLeft
                    size={20}
                    className="transition-transform group-hover:-translate-x-0.5"
                  />
                </Link>

                <div className="flex w-full flex-col gap-3">
                  <div>
                    <h1 className="flex flex-wrap items-center gap-3 break-words text-3xl font-bold tracking-tight text-text-primary">
                      {t('title')}
                    </h1>
                    <p className="mt-2 max-w-3xl break-words text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                      {t('description')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-surface-secondary" />

        <div className="px-8 py-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-[var(--surface-subtle)] p-4 sm:p-6">
            {isLoading ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 size={20} className="animate-spin text-text-secondary" />
              </div>
            ) : !config ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="font-semibold text-text-primary">{t('notFoundTitle')}</p>
                <p className="max-w-md text-sm text-text-secondary">{t('notFoundBody')}</p>
                <Link
                  href={`/workflows/${workflowId}`}
                  className="rounded-xl border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint)]"
                >
                  {t('backToWorkflow')}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* El número es la llave con la que llega cada mensaje entrante, así que
                    se muestra pero no se edita desde aquí. */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tint)] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    {t('phoneNumberLabel')}
                  </p>
                  <p className="mt-1 break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-xs text-text-primary sm:text-sm">
                    {config.phoneNumber}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">{t('phoneNumberHint')}</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="display-name" className="text-sm font-medium text-text-primary">
                    {t('displayNameLabel')}
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={INPUT_CLASSES}
                    placeholder={t('displayNamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-text-primary">
                    {t('descriptionLabel')}{' '}
                    <span className="text-text-tertiary">{t('optionalSuffix')}</span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className={`resize-none ${INPUT_CLASSES}`}
                    placeholder={t('descriptionPlaceholder')}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Link
                    href={`/workflows/${workflowId}`}
                    className="flex-1 rounded-xl border border-border bg-surface-elevated px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint)]"
                  >
                    {t('cancelButton')}
                  </Link>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={updateWhatsappConfiguration.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updateWhatsappConfiguration.isPending ? t('savingButton') : t('saveButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
