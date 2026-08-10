'use client';

import PermissionGuard from '@/components/auth/permission-guard';
import { Modal } from '@/components/ui/modal';
import { useMessengerMutations } from '@/hooks/messaging/use-messenger-config';
import { Link } from '@/i18n/routing';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function WorkflowMessengerPage() {
  const params = useParams();
  const workflowId = params.id as string;
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
      toast.error('Page name, app secret and page access token are required.');
      return;
    }

    try {
      // El backend requiere pageId; por ahora usamos el valor capturado como Page's Name.
      await addMessengerConfiguration.mutateAsync({
        workflowId,
        pageId: normalizedPageName,
        pageName: normalizedPageName,
        appSecret: normalizedAppSecret,
        pageAccessToken: normalizedPageAccessToken,
      });

      toast.success('Messenger configuration linked successfully.');
      setPageName('');
      setDescription('');
      setAppSecret('');
      setPageAccessToken('');
    } catch (error: any) {
      const backendMessage =
        (typeof error?.response?.data?.message === 'string' &&
          error.response.data.message.trim()) ||
        (typeof error?.message === 'string' && error.message.trim()) ||
        'Unable to create Messenger configuration.';

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
                  <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
                </Link>

                <div className="flex w-full flex-col gap-3">
                  <div>
                    <h1 className="flex flex-wrap items-center gap-3 break-words text-3xl font-bold tracking-tight text-text-primary">
                      Messenger Channel
                      <button
                        type="button"
                        onClick={() => setIsInfoModalOpen(true)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-tertiary transition-colors hover:bg-surface-secondary"
                        aria-label="Open Messenger setup help"
                      >
                        <CircleHelp size={15} />
                      </button>
                    </h1>
                    <p className="mt-2 max-w-3xl break-words text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                      Add your Facebook Messenger credentials to connect this workflow.
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
            <div className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-info-500/25 bg-info-500/5 p-4">
                  <p className="text-sm font-semibold text-text-primary">Webhook data for Meta setup</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    When configuring the Messenger webhook in Meta Developers, use the values below:
                  </p>

                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                          Callback URL
                        </p>
                        <button
                          type="button"
                          onClick={() => setWebhookFieldInfo('callback')}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                          aria-label="More info about callback URL"
                        >
                          <CircleHelp size={13} />
                        </button>
                      </div>
                      <p className="mt-1 break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-xs text-text-primary sm:text-sm">
                        https://api.tesseract.fractalops.com.mx/api/messenger/webhook
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                          Verify Token (Webhook Secret)
                        </p>
                        <button
                          type="button"
                          onClick={() => setWebhookFieldInfo('secret')}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                          aria-label="More info about webhook secret"
                        >
                          <CircleHelp size={13} />
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
                    Page's Name
                  </label>
                  <input
                    id="page-name"
                    type="text"
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
                    placeholder="e.g. RGM Advanced"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-text-primary">
                    Description <span className="text-text-tertiary">(Optional)</span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
                    placeholder="Internal notes for this channel configuration"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="app-secret" className="text-sm font-medium text-text-primary">
                    App Secret
                  </label>
                  <input
                    id="app-secret"
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
                    placeholder="Enter app secret"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="page-access-token" className="text-sm font-medium text-text-primary">
                    Page Access Token
                  </label>
                  <textarea
                    id="page-access-token"
                    value={pageAccessToken}
                    onChange={(e) => setPageAccessToken(e.target.value)}
                    className="min-h-[120px] w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
                    placeholder="Enter page access token"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Link
                    href="/workflows"
                    className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
                  >
                    Cancel
                  </Link>
                  <button
                    type="button"
                    onClick={handleMessengerIntegration}
                    disabled={addMessengerConfiguration.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
                  >
                    {addMessengerConfiguration.isPending ? 'Saving...' : 'Save Messenger'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        title="How to fill this form"
        size="lg"
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p className="text-text-primary">
            This form connects a Facebook Page to your workflow through the Messenger channel.
          </p>

          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary p-4">
            <div>
              <p className="font-semibold text-text-primary">Page&apos;s Name</p>
              <p>Name shown in Tesseract to identify this connected Facebook Page.</p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">Description (Optional)</p>
              <p>Internal note for your team. It does not affect Meta integration behavior.</p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">App Secret</p>
              <p>
                Secret key of your Meta app. It is used to verify requests/signatures securely.
              </p>
            </div>

            <div>
              <p className="font-semibold text-text-primary">Page Access Token</p>
              <p>
                Token that lets the app read/send messages for your Facebook Page in Messenger.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-text-primary">Meta documentation</p>
            <a
              href="https://developers.facebook.com/docs/development/create-an-app"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-info-600 underline-offset-2 hover:underline"
            >
              Create a Meta developer account and app
            </a>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={webhookFieldInfo !== null}
        onClose={() => setWebhookFieldInfo(null)}
        title={webhookFieldInfo === 'callback' ? 'Callback URL' : 'Webhook Secret'}
      >
        <div className="space-y-2 text-sm text-text-secondary">
          {webhookFieldInfo === 'callback' ? (
            <>
              <p className="text-text-primary">
                This is the public endpoint Meta will call to verify the webhook and deliver
                Messenger events.
              </p>
              <p>
                Use this exact value in the <span className="font-medium text-text-primary">Callback URL</span>{' '}
                field when registering the webhook in Meta Developers.
              </p>
            </>
          ) : (
            <>
              <p className="text-text-primary">
                This token is used by Meta during webhook verification to confirm ownership of
                the endpoint.
              </p>
              <p>
                Paste this exact value into the <span className="font-medium text-text-primary">Verify Token</span>{' '}
                field in Meta Developers.
              </p>
            </>
          )}
        </div>
      </Modal>
    </PermissionGuard>
  );
}
