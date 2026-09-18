'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import { btnGhost, btnPrimary, inputClass, labelClass } from '../../_styles';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: UserRole.OWNER, label: 'Owner' },
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.VIEWER, label: 'Viewer' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

export default function NewAnnouncementPage() {
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
    setTargetRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
    setConfirmedBroadcast(false);
  };

  const handleTargetOrganizationsChange = (ids: string[]) => {
    setTargetOrganizationIds(ids);
    setConfirmedBroadcast(false);
  };

  const previewAnnouncement: PendingAnnouncementDto = {
    userNotificationId: 'preview',
    template,
    title: (contentLocale === 'en' ? titleEn : title) || 'Título del anuncio',
    message: (contentLocale === 'en' ? messageEn : message) || 'Cuerpo del anuncio…',
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
              ? `${targetOrganizationIds.length} organización(es) elegidas`
              : 'TODAS las organizaciones';
          setAudienceConfirm({ count: result.count, scope });
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (title.trim().length < 3) return toast.error('El título debe tener al menos 3 caracteres');
    if (message.trim().length < 3) return toast.error('El cuerpo debe tener al menos 3 caracteres');
    if (targetRoles.length === 0) return toast.error('Elige al menos un rol destino');
    if (ctaUrl && !ctaLabel) return toast.error('Si pones un link, ponle también un texto de botón en español');
    if (publishNow && !confirmedBroadcast) {
      return toast.error('Primero confirma el tamaño de la audiencia con "Revisar destino"');
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
        toast.success(publishNow ? 'Anuncio publicado' : 'Anuncio guardado como borrador');
        router.push('/admin/anuncios');
      },
      onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo crear el anuncio'),
    });
  };

  return (
    <div className="w-full pb-24">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/anuncios')}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          aria-label="Volver a anuncios"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Nuevo anuncio</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Se muestra como un mensaje a pantalla completa la próxima vez que el usuario entre a la app.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Section title="Plantilla">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [AnnouncementTemplateKind.NEWS, 'Noticia', Newspaper, 'Sobria, con botón de enlace opcional'],
                    [AnnouncementTemplateKind.CELEBRATION, 'Celebración', PartyPopper, 'Con confetti — regalos de créditos, hitos'],
                  ] as const
                ).map(([value, label, Icon, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTemplate(value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      template === value
                        ? 'border-accent bg-surface-secondary'
                        : 'border-border hover:bg-surface-secondary'
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
                Ver vista previa a pantalla completa
              </button>
            </Section>

            <Section title="Contenido">
              <div className="mb-3 flex w-full gap-1 rounded-lg border border-border p-1">
                {(['es', 'en'] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setContentLocale(loc)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      contentLocale === loc
                        ? 'bg-accent text-text-inverse'
                        : 'text-text-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    {loc === 'es' ? 'Español' : 'English (opcional)'}
                  </button>
                ))}
              </div>

              {contentLocale === 'es' ? (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Título (español)</label>
                    <input
                      className={inputClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Cambios en la forma de cobro"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Cuerpo (español) — admite Markdown</label>
                    <textarea
                      className={`${inputClass} min-h-56 resize-y font-mono text-sm`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={'A partir de hoy…\n\n- Punto uno\n- Punto dos\n\n**Importante:** …'}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Título (inglés) — opcional</label>
                    <input
                      className={inputClass}
                      value={titleEn}
                      onChange={(e) => setTitleEn(e.target.value)}
                      placeholder="Billing changes"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Cuerpo (inglés) — opcional, admite Markdown</label>
                    <textarea
                      className={`${inputClass} min-h-56 resize-y font-mono text-sm`}
                      value={messageEn}
                      onChange={(e) => setMessageEn(e.target.value)}
                      placeholder="Starting today…"
                    />
                  </div>
                  <p className="text-xs text-text-secondary">
                    Si lo dejas vacío, los usuarios con la app en inglés verán el contenido en español.
                  </p>
                </div>
              )}
            </Section>

            <Section title="Botón de acción (opcional)">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Texto del botón (español)</label>
                  <input className={inputClass} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ver detalles" />
                </div>
                <div>
                  <label className={labelClass}>Texto del botón (inglés)</label>
                  <input className={inputClass} value={ctaLabelEn} onChange={(e) => setCtaLabelEn(e.target.value)} placeholder="See details" />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>Link del botón</label>
                <input className={inputClass} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="/billing o https://…" />
                <p className="mt-1 text-xs text-text-secondary">
                  Si no le pones texto al botón (en el idioma que corresponda), el botón no aparece.
                </p>
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Destino">
              <div className="space-y-4">
                <OrganizationMultiSelect value={targetOrganizationIds} onChange={handleTargetOrganizationsChange} />
                <div>
                  <label className={labelClass}>Roles destino</label>
                  <div className="flex flex-wrap gap-3">
                    {ROLE_OPTIONS.map((r) => (
                      <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
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

            <Section title="Vigencia">
              <label className={labelClass}>Caduca (opcional)</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Apaga el modal en esa fecha, pero se queda visible en la campana de quien ya lo recibió.
              </p>
            </Section>

            <Section title="Publicación">
              <div className="space-y-3">
                <Switch checked={publishNow} onChange={setPublishNow} label="Publicar de inmediato" hint="Si lo apagas, queda como borrador y lo publicas después con un botón." />
                {publishNow && (
                  <div className="rounded-lg border border-border bg-surface-secondary p-3">
                    <p className="text-xs text-text-secondary">
                      {confirmedBroadcast ? 'Destino confirmado.' : 'Revisa cuántos usuarios recibirán este anuncio antes de publicar.'}
                    </p>
                    <button
                      type="button"
                      onClick={requestAudienceReview}
                      disabled={audiencePreview.isPending || targetRoles.length === 0}
                      className={`${btnGhost} mt-2 w-full justify-center`}
                    >
                      {audiencePreview.isPending ? 'Calculando…' : 'Revisar destino'}
                    </button>
                  </div>
                )}
              </div>
            </Section>
          </div>
        </div>

        <div className="sticky bottom-0 -mx-4 mt-6 flex justify-end gap-2 border-t border-border bg-dashboard-background/95 px-4 py-4 backdrop-blur-sm md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <button type="button" className={btnGhost} onClick={() => router.push('/admin/anuncios')} disabled={createAnnouncement.isPending}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={createAnnouncement.isPending}>
            {createAnnouncement.isPending ? 'Guardando…' : publishNow ? 'Publicar' : 'Guardar borrador'}
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
        title="Confirmar destino"
        message={
          audienceConfirm
            ? `Este anuncio llegará a ${audienceConfirm.count} usuario(s) en ${audienceConfirm.scope}. ¿Confirmas el envío?`
            : ''
        }
        confirmLabel="Confirmar"
        cancelLabel="Revisar de nuevo"
        variant="warning"
      />
    </div>
  );
}
