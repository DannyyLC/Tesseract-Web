'use client';

import PermissionGuard from '@/components/auth/permission-guard';
import { Modal } from '@/components/ui/modal';
import { useMessengerMutations } from '@/hooks/messaging/use-messenger-config';
import { Link } from '@/i18n/routing';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Los cuatro campos comparten estilo. El foco usa `border-focus`, el token del sistema que
 * se adapta al tema, en vez de un azul fijo: era el único sitio del panel con foco azul.
 */
const INPUT_CLASSES =
  'w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-border-focus focus:bg-surface';

export default function WorkflowMessengerPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const t = useTranslations('MessengerSetup');
  const [pageName, setPageName] = useState('');
  const [description, setDescription] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [webhookFieldInfo, setWebhookFieldInfo] = useState<'callback' | 'secret' | null>(null);
  const { addMessengerConfiguration } = useMessengerMutations();

  const handleMessengerIntegration = async () => {
    const normalizedPageName = pageName.trim();
    const normalizedAppSecret = appSecret.trim();
    const normalizedPageAccessToken = pageAccessToken.trim();

    if (!normalizedPageName || !normalizedAppSecret || !normalizedPageAccessToken) {
      toast.error(t('requiredFieldsError'));
      return;
    }

    try {
      // El backend requiere pageId; por ahora usamos el valor capturado como Page's Name.
      await addMessengerConfiguration.mutateAsync({
        workflowId,
        pageId: normalizedPageName,
        pageName: normalizedPageName,
        description: description.trim(),
        appSecret: normalizedAppSecret,
        pageAccessToken: normalizedPageAccessToken,
      });

      toast.success(t('linkSuccess'));
      setPageName('');
      setDescription('');
      setAppSecret('');
      setPageAccessToken('');
    } catch (error: any) {
      const backendMessage =
        (typeof error?.response?.data?.message === 'string' &&
          error.response.data.message.trim()) ||
        (typeof error?.message === 'string' && error.message.trim()) ||
        t('linkError');

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
                  href="/workflows"
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
                      {/* El icono ya trae su propio círculo; encerrarlo en otro lo duplicaba. */}
                      <button
                        type="button"
                        onClick={() => setIsInfoModalOpen(true)}
                        className="inline-flex items-center justify-center rounded-full p-1 text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={t('helpAriaLabel')}
                      >
                        <CircleHelp size={18} />
                      </button>
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

        {/* Una sola tarjeta, como el resto de secciones del detalle del workflow: antes había
            un `surface-subtle` envolviendo a un `surface-elevated` y los dos marcos se leían
            como un error de maquetación. */}
        <div className="px-8 py-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-[var(--surface-subtle)] p-4 sm:p-6">
            <div className="space-y-4">
              {/* Tokens con alfa propio, no modificadores de opacidad: los colores del tema
                  están definidos como `var(--x)` opaco, así que Tailwind descarta en silencio
                  clases como `border-info-500/20` y el borde caía al gris claro por defecto
                  —blanco sobre fondo oscuro—. Ver nota al respecto en la revisión. */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tint)] p-4">
                <p className="text-sm font-semibold text-text-primary">{t('webhookTitle')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('webhookIntro')}</p>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        {t('callbackUrlLabel')}
                      </p>
                      <button
                        type="button"
                        onClick={() => setWebhookFieldInfo('callback')}
                        className="inline-flex items-center justify-center rounded-full p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={t('callbackUrlInfoAriaLabel')}
                      >
                        <CircleHelp size={14} />
                      </button>
                    </div>
                    <p className="mt-1 break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-xs text-text-primary sm:text-sm">
                      https://api.tesseract.fractalops.com.mx/api/messenger/webhook
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        {t('verifyTokenLabel')}
                      </p>
                      <button
                        type="button"
                        onClick={() => setWebhookFieldInfo('secret')}
                        className="inline-flex items-center justify-center rounded-full p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={t('verifyTokenInfoAriaLabel')}
                      >
                        <CircleHelp size={14} />
                      </button>
                    </div>
                    <p className="mt-1 break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-xs text-text-primary sm:text-sm">
                      Fr4cT4L-010126
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="page-name" className="text-sm font-medium text-text-primary">
                  {t('pageNameLabel')}
                </label>
                <input
                  id="page-name"
                  type="text"
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  className={INPUT_CLASSES}
                  placeholder={t('pageNamePlaceholder')}
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

              <div className="space-y-2">
                <label htmlFor="app-secret" className="text-sm font-medium text-text-primary">
                  {t('appSecretLabel')}
                </label>
                <input
                  id="app-secret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className={INPUT_CLASSES}
                  placeholder={t('appSecretPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="page-access-token"
                  className="text-sm font-medium text-text-primary"
                >
                  {t('pageAccessTokenLabel')}
                </label>
                <textarea
                  id="page-access-token"
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  rows={4}
                  className={`resize-none font-mono text-sm ${INPUT_CLASSES}`}
                  placeholder={t('pageAccessTokenPlaceholder')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Link
                  href="/workflows"
                  className="flex-1 rounded-xl border border-border bg-surface-elevated px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint)]"
                >
                  {t('cancelButton')}
                </Link>
                <button
                  type="button"
                  onClick={handleMessengerIntegration}
                  disabled={addMessengerConfiguration.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addMessengerConfiguration.isPending ? t('savingButton') : t('saveButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        title={t('helpModalTitle')}
        size="lg"
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p className="text-text-primary">{t('helpIntro')}</p>

          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary p-4">
            <div>
              <p className="font-semibold text-text-primary">{t('helpPageNameTitle')}</p>
              <p>{t('helpPageNameBody')}</p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">{t('helpDescriptionTitle')}</p>
              <p>{t('helpDescriptionBody')}</p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">{t('helpAppSecretTitle')}</p>
              <p>{t('helpAppSecretBody')}</p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">{t('helpPageAccessTokenTitle')}</p>
              <p>{t('helpPageAccessTokenBody')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-text-primary">{t('helpDocsTitle')}</p>
            <a
              href="https://developers.facebook.com/docs/development/create-an-app"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[var(--info-text-adaptive)] underline-offset-2 hover:underline"
            >
              {t('helpDocsLink')}
            </a>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={webhookFieldInfo !== null}
        onClose={() => setWebhookFieldInfo(null)}
        title={webhookFieldInfo === 'callback' ? t('callbackModalTitle') : t('secretModalTitle')}
      >
        <div className="space-y-2 text-sm text-text-secondary">
          {webhookFieldInfo === 'callback' ? (
            <>
              <p className="text-text-primary">{t('callbackModalIntro')}</p>
              {/* El nombre del campo va en negrita dentro de la frase, así que la traducción
                  se mantiene entera en vez de partirla en trozos que no se pueden reordenar. */}
              <p>
                {t.rich('callbackModalUsage', {
                  field: (chunks) => (
                    <span className="font-medium text-text-primary">{chunks}</span>
                  ),
                })}
              </p>
            </>
          ) : (
            <>
              <p className="text-text-primary">{t('secretModalIntro')}</p>
              <p>
                {t.rich('secretModalUsage', {
                  field: (chunks) => (
                    <span className="font-medium text-text-primary">{chunks}</span>
                  ),
                })}
              </p>
            </>
          )}
        </div>
      </Modal>
    </PermissionGuard>
  );
}
