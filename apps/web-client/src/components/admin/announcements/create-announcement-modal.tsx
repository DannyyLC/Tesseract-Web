'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Newspaper, PartyPopper } from 'lucide-react';
import {
  AnnouncementTemplateKind,
  CreateAnnouncementDto,
  PendingAnnouncementDto,
  UserRole,
} from '@tesseract/types';
import { Modal } from '@/components/ui/modal';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Switch } from '@/components/ui/switch';
import { AnnouncementModal } from '@/components/announcements/announcement-modal';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import {
  useAdminAnnouncementMutations,
  useAudiencePreview,
} from '@/hooks/platform/use-admin-announcements';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  onClose: () => void;
  onCreated: (message: string) => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: UserRole.OWNER, label: 'Owner' },
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.VIEWER, label: 'Viewer' },
];

export function CreateAnnouncementModal({ onClose, onCreated }: Props) {
  const [contentLocale, setContentLocale] = useState<'es' | 'en'>('es');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [template, setTemplate] = useState<AnnouncementTemplateKind>(AnnouncementTemplateKind.NEWS);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER]);
  const [expiresAt, setExpiresAt] = useState('');
  const [publishNow, setPublishNow] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmedBroadcast, setConfirmedBroadcast] = useState(false);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearchInput || undefined });

  const organizations = useMemo(() => orgPages?.pages.flatMap((p) => p.data) ?? [], [orgPages]);
  const orgOptions = useMemo(
    () => [
      { label: 'Todas las organizaciones', value: '' },
      ...organizations.map((o) => ({ label: o.name, value: o.id })),
    ],
    [organizations],
  );

  const { createAnnouncement } = useAdminAnnouncementMutations();
  const audiencePreview = useAudiencePreview();

  const isAllOrgs = targetOrganizationId === '';

  const toggleRole = (role: UserRole) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
    setConfirmedBroadcast(false);
  };

  const previewAnnouncement: PendingAnnouncementDto = {
    userNotificationId: 'preview',
    template,
    title: title || 'Título del anuncio',
    message: message || 'Cuerpo del anuncio…',
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
    createdAt: new Date().toISOString(),
  };

  const checkAudienceAndConfirm = () => {
    audiencePreview.mutate(
      { organizationId: targetOrganizationId || undefined, roles: targetRoles },
      {
        onSuccess: (result) => {
          const scope = isAllOrgs ? 'TODAS las organizaciones' : 'la organización elegida';
          const ok = window.confirm(
            `Este anuncio llegará a ${result.count} usuario(s) en ${scope}. ¿Confirmas el envío?`,
          );
          if (ok) {
            setConfirmedBroadcast(true);
            toast.info('Destino confirmado. Ahora puedes publicar.');
          }
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (title.trim().length < 3) return toast.error('El título debe tener al menos 3 caracteres');
    if (message.trim().length < 3) return toast.error('El cuerpo debe tener al menos 3 caracteres');
    if (targetRoles.length === 0) return toast.error('Elige al menos un rol destino');
    if (ctaUrl && !ctaLabel) return toast.error('Si pones un link, ponle también un texto de botón');
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
      ctaUrl: ctaUrl.trim() || undefined,
      targetOrganizationId: targetOrganizationId || null,
      targetRoles,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      publishNow,
    };

    createAnnouncement.mutate(dto, {
      onSuccess: () => onCreated(publishNow ? 'Anuncio publicado' : 'Anuncio guardado como borrador'),
      onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo crear el anuncio'),
    });
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title="Nuevo anuncio" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {(['es', 'en'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setContentLocale(loc)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    contentLocale === loc
                      ? 'bg-accent text-text-inverse'
                      : 'text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {loc === 'es' ? 'Español' : 'English (opcional)'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:opacity-80"
            >
              <Eye size={14} />
              Vista previa
            </button>
          </div>

          {contentLocale === 'es' ? (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Título (español)</label>
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cambios en la forma de cobro" />
              </div>
              <div>
                <label className={labelClass}>Cuerpo (español)</label>
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A partir de hoy…"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Título (inglés) — opcional</label>
                <input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Billing changes" />
              </div>
              <div>
                <label className={labelClass}>Cuerpo (inglés) — opcional</label>
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Texto del botón (opcional)</label>
              <input className={inputClass} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ver detalles" />
            </div>
            <div>
              <label className={labelClass}>Link del botón (opcional)</label>
              <input className={inputClass} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="/billing o https://…" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Organización destino</label>
            <InfiniteSelect
              value={targetOrganizationId}
              onChange={(v) => {
                setTargetOrganizationId(v);
                setConfirmedBroadcast(false);
              }}
              options={orgOptions}
              placeholder="Elige el destino"
              isLoading={orgsLoading}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              searchValue={orgSearchInput}
              onSearchChange={setOrgSearchInput}
              searchPlaceholder="Buscar organización..."
            />
          </div>

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

          <div>
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
          </div>

          <div className="rounded-lg border border-border p-3">
            <Switch checked={publishNow} onChange={setPublishNow} label="Publicar de inmediato" hint="Si lo apagas, queda como borrador y lo publicas después con un botón." />
          </div>

          {publishNow && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary p-3">
              <p className="text-xs text-text-secondary">
                {confirmedBroadcast
                  ? 'Destino confirmado.'
                  : isAllOrgs
                    ? 'Vas a enviar a TODAS las organizaciones. Revisa el destino antes de publicar.'
                    : 'Revisa cuántos usuarios recibirán este anuncio antes de publicar.'}
              </p>
              <button
                type="button"
                onClick={checkAudienceAndConfirm}
                disabled={audiencePreview.isPending || targetRoles.length === 0}
                className={btnGhost}
              >
                {audiencePreview.isPending ? 'Calculando…' : 'Revisar destino'}
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btnGhost} onClick={onClose} disabled={createAnnouncement.isPending}>
              Cancelar
            </button>
            <button type="submit" className={btnPrimary} disabled={createAnnouncement.isPending}>
              {createAnnouncement.isPending ? 'Guardando…' : publishNow ? 'Publicar' : 'Guardar borrador'}
            </button>
          </div>
        </form>
      </Modal>

      {showPreview && (
        <AnnouncementModal
          announcement={previewAnnouncement}
          preview
          onPreviewClose={() => setShowPreview(false)}
          onDismiss={() => setShowPreview(false)}
          onCtaClick={() => {}}
        />
      )}
    </>
  );
}
