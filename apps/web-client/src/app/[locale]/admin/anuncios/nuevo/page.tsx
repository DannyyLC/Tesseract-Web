'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Eye, Newspaper, PartyPopper } from 'lucide-react';
import {
  AnnouncementTemplateKind,
  CreateAnnouncementDto,
  PendingAnnouncementDto,
  UserRole,
} from '@tesseract/types';
import { useRouter } from '@/i18n/routing';
import { Switch } from '@/components/ui/switch';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { AnnouncementModal } from '@/components/announcements/announcement-modal';
import { OrganizationMultiSelect } from '@/components/admin/announcements/organization-multi-select';
import {
  useAdminAnnouncementMutations,
  useAudiencePreview,
} from '@/hooks/platform/use-admin-announcements';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import {
  btnGhost,
  btnPrimary,
  inputClass,
  labelClass,
  pageSubtitleClass,
  pageTitleClass,
  sectionClass,
  sectionTitleClass,
  segmentedItemClass,
  segmentedTrackClass,
} from '../../_styles';
import { isToastHandled } from '@/lib/api/api-error';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: UserRole.OWNER, label: 'Owner' },
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.VIEWER, label: 'Viewer' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${sectionClass} p-6`}>
      <h2 className={`mb-4 ${sectionTitleClass}`}>{title}</h2>
      {children}
    </section>
  );
}

export default function NewAnnouncementPage() {
  const t = useTranslations('Admin.NewAnnouncement');
  const getApiErrorMessage = useApiErrorMessage();
  const router = useRouter();

  const [contentLocale, setContentLocale] = useState<'es' | 'en'>('es');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [template, setTemplate] = useState<AnnouncementTemplateKind>(AnnouncementTemplateKind.NEWS);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaLabelEn, setCtaLabelEn] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [targetOrganizationIds, setTargetOrganizationIds] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.VIEWER,
  ]);
  const [expiresAt, setExpiresAt] = useState('');
  const [publishNow, setPublishNow] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmedBroadcast, setConfirmedBroadcast] = useState(false);
  const [audienceConfirm, setAudienceConfirm] = useState<{ count: number; scope: string } | null>(
    null,
  );

  const { createAnnouncement } = useAdminAnnouncementMutations();
  const audiencePreview = useAudiencePreview();

  const toggleRole = (role: UserRole) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
    setConfirmedBroadcast(false);
  };

  const handleTargetOrganizationsChange = (ids: string[]) => {
    setTargetOrganizationIds(ids);
    setConfirmedBroadcast(false);
  };

  const previewAnnouncement: PendingAnnouncementDto = {
    userNotificationId: 'preview',
    template,
    title: (contentLocale === 'en' ? titleEn : title) || t('previewTitleFallback'),
    message: (contentLocale === 'en' ? messageEn : message) || t('previewBodyFallback'),
    ctaLabel: (contentLocale === 'en' ? ctaLabelEn : ctaLabel) || null,
    ctaUrl: ctaUrl || null,
    createdAt: new Date().toISOString(),
  };

  const requestAudienceReview = () => {
    audiencePreview.mutate(
      { organizationIds: targetOrganizationIds, roles: targetRoles },
      {
        onSuccess: (result) => {
          const scope =
            targetOrganizationIds.length > 0
              ? t('someOrgsChosen', { count: targetOrganizationIds.length })
              : t('allOrgsScope');
          setAudienceConfirm({ count: result.count, scope });
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (title.trim().length < 3) return toast.error(t('titleTooShort'));
    if (message.trim().length < 3) return toast.error(t('bodyTooShort'));
    if (targetRoles.length === 0) return toast.error(t('noRoleSelected'));
    if (ctaUrl && !ctaLabel) return toast.error(t('ctaMissingLabel'));
    if (publishNow && !confirmedBroadcast) {
      return toast.error(t('reviewFirst'));
    }

    const dto: CreateAnnouncementDto = {
      title: title.trim(),
      message: message.trim(),
      titleEn: titleEn.trim() || undefined,
      messageEn: messageEn.trim() || undefined,
      template,
      ctaLabel: ctaLabel.trim() || undefined,
      ctaLabelEn: ctaLabelEn.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
      targetOrganizationIds,
      targetRoles,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      publishNow,
    };

    createAnnouncement.mutate(dto, {
      onSuccess: () => {
        toast.success(publishNow ? t('publishedSuccess') : t('draftSavedSuccess'));
        router.push('/admin/anuncios');
      },
      onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
    });
  };

  return (
    <div className="w-full pb-24">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/anuncios')}
          className="rounded-xl p-2 text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
          aria-label={t('backToAnnouncements')}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className={pageTitleClass}>{t('title')}</h1>
          <p className={pageSubtitleClass}>{t('subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Section title={t('templateSection')}>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [
                      AnnouncementTemplateKind.NEWS,
                      t('templateNews'),
                      Newspaper,
                      t('templateNewsHint'),
                    ],
                    [
                      AnnouncementTemplateKind.CELEBRATION,
                      t('templateCelebration'),
                      PartyPopper,
                      t('templateCelebrationHint'),
                    ],
                  ] as const
                ).map(([value, label, Icon, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTemplate(value)}
                    className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                      template === value
                        ? 'border-accent shadow-sm'
                        : 'border-border hover:border-border-hover hover:shadow-sm'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      <Icon size={14} />
                      {label}
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">{hint}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:opacity-80"
              >
                <Eye size={14} />
                {t('previewButton')}
              </button>
            </Section>

            <Section title={t('contentSection')}>
              <div className={`${segmentedTrackClass} mb-4 w-full`}>
                {(['es', 'en'] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setContentLocale(loc)}
                    className={`flex-1 ${segmentedItemClass(contentLocale === loc)}`}
                  >
                    {loc === 'es' ? t('localeSpanish') : t('localeEnglishOptional')}
                  </button>
                ))}
              </div>

              {contentLocale === 'es' ? (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>{t('titleEsLabel')}</label>
                    <input
                      className={inputClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('titleEsPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('bodyEsLabel')}</label>
                    <textarea
                      className={`${inputClass} min-h-56 resize-y font-mono text-sm`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        'A partir de hoy…\n\n- Punto uno\n- Punto dos\n\n**Importante:** …'
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>{t('titleEnLabel')}</label>
                    <input
                      className={inputClass}
                      value={titleEn}
                      onChange={(e) => setTitleEn(e.target.value)}
                      placeholder={t('titleEnPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('bodyEnLabel')}</label>
                    <textarea
                      className={`${inputClass} min-h-56 resize-y font-mono text-sm`}
                      value={messageEn}
                      onChange={(e) => setMessageEn(e.target.value)}
                      placeholder={t('bodyEnPlaceholder')}
                    />
                  </div>
                  <p className="text-xs text-text-secondary">{t('fallbackHint')}</p>
                </div>
              )}
            </Section>

            <Section title={t('ctaSection')}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t('ctaLabelEsLabel')}</label>
                  <input
                    className={inputClass}
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder={t('ctaLabelEsPlaceholder')}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('ctaLabelEnLabel')}</label>
                  <input
                    className={inputClass}
                    value={ctaLabelEn}
                    onChange={(e) => setCtaLabelEn(e.target.value)}
                    placeholder={t('ctaLabelEnPlaceholder')}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('ctaUrlLabel')}</label>
                <input
                  className={inputClass}
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder={t('ctaUrlPlaceholder')}
                />
                <p className="mt-1 text-xs text-text-secondary">{t('ctaHint')}</p>
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title={t('targetSection')}>
              <div className="space-y-4">
                <OrganizationMultiSelect
                  value={targetOrganizationIds}
                  onChange={handleTargetOrganizationsChange}
                />
                <div>
                  <label className={labelClass}>{t('targetRolesLabel')}</label>
                  <div className="flex flex-wrap gap-3">
                    {ROLE_OPTIONS.map((r) => (
                      <label
                        key={r.value}
                        className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-accent"
                          checked={targetRoles.includes(r.value)}
                          onChange={() => toggleRole(r.value)}
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section title={t('expirySection')}>
              <label className={labelClass}>{t('expiresLabel')}</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">{t('expiresHint')}</p>
            </Section>

            <Section title={t('publishSection')}>
              <div className="space-y-3">
                <Switch
                  checked={publishNow}
                  onChange={setPublishNow}
                  label={t('publishNowLabel')}
                  hint={t('publishNowHint')}
                />
                {publishNow && (
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-xs text-text-secondary">
                      {confirmedBroadcast ? t('targetConfirmed') : t('reviewAudienceHint')}
                    </p>
                    <button
                      type="button"
                      onClick={requestAudienceReview}
                      disabled={audiencePreview.isPending || targetRoles.length === 0}
                      className={`${btnGhost} mt-2 w-full justify-center`}
                    >
                      {audiencePreview.isPending ? t('calculating') : t('reviewTarget')}
                    </button>
                  </div>
                )}
              </div>
            </Section>
          </div>
        </div>

        <div className="bg-surface/80 sticky bottom-0 -mx-4 mt-6 flex justify-end gap-2 border-t border-border px-4 py-4 backdrop-blur-xl md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <button
            type="button"
            className={btnGhost}
            onClick={() => router.push('/admin/anuncios')}
            disabled={createAnnouncement.isPending}
          >
            {t('cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={createAnnouncement.isPending}>
            {createAnnouncement.isPending
              ? t('saving')
              : publishNow
                ? t('publish')
                : t('saveDraft')}
          </button>
        </div>
      </form>

      <AnimatePresence>
        {showPreview && (
          <AnnouncementModal
            announcement={previewAnnouncement}
            preview
            onPreviewClose={() => setShowPreview(false)}
            onDismiss={() => setShowPreview(false)}
            onCtaClick={() => {}}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!audienceConfirm}
        onClose={() => setAudienceConfirm(null)}
        onConfirm={() => {
          setConfirmedBroadcast(true);
          setAudienceConfirm(null);
        }}
        title={t('confirmTargetTitle')}
        message={
          audienceConfirm
            ? t('confirmTargetMessage', {
                count: audienceConfirm.count,
                scope: audienceConfirm.scope,
              })
            : ''
        }
        confirmLabel={t('confirm')}
        cancelLabel={t('reviewAgain')}
        variant="warning"
      />
    </div>
  );
}
