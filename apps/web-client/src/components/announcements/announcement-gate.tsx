'use client';

import { useLocale } from 'next-intl';
import { useAuth } from '@/hooks/identity/use-auth';
import { usePendingAnnouncements, useAnnouncementMutations } from '@/hooks/platform/use-announcements';
import { AnnouncementModal } from './announcement-modal';

/**
 * Puerta de entrada de los anuncios bloqueantes. Se monta como HERMANO de `<main>` en
 * `(dashboard)/layout.tsx`, nunca envolviéndolo: así el contenido de la página nunca
 * espera a esta consulta, y mientras no hay datos el componente devuelve `null` en vez
 * de parpadear un modal vacío.
 */
export function AnnouncementGate() {
  const { data: user } = useAuth();
  const locale = useLocale();
  const { data: pending } = usePendingAnnouncements(locale, !!user);
  const { dismiss, registerCtaClick } = useAnnouncementMutations(locale);

  if (!pending || pending.length === 0) return null;

  // Uno a la vez, el más viejo primero (ya viene ordenado así del backend). Al cerrarlo,
  // `removeFromCache` lo quita de la lista y este mismo componente re-renderiza con el
  // siguiente, sin esperar un refetch.
  const current = pending[0];

  return (
    <AnnouncementModal
      announcement={current}
      onDismiss={() => dismiss.mutate(current.userNotificationId)}
      onCtaClick={() => {
        registerCtaClick.mutate(current.userNotificationId);
        dismiss.mutate(current.userNotificationId);
      }}
    />
  );
}
