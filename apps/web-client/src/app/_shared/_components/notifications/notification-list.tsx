import { useEffect, useRef, useState } from 'react';
import { useInfiniteNotifications, useNotificationMutations } from '@/hooks/useNotifications';
import NotificationItem from './notification-item';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { NotificationEventDto } from '@tesseract/types';

export default function NotificationList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteNotifications();

  const { markAsRead, deleteNotification } = useNotificationMutations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set());
  // Orden congelado de IDs mientras hay una notificación abierta
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);

  const handleDelete = (id: string) => {
    deleteNotification.mutate(id, {
      onSuccess: () => {
        toast.success('Notificación eliminada');
      },
      onError: () => {
        toast.error('Error al eliminar la notificación');
      },
    });
  };

  const handleRead = (id: string) => {
    setPendingReadIds((prev) => new Set(prev).add(id));
    markAsRead.mutate(id);
  };

  const handleToggle = (id: string, currentNotifications: NotificationEventDto[]) => {
    if (expandedId === id) {
      // Cerrando → descongelar orden
      setExpandedId(null);
      setFrozenOrder(null);
    } else {
      // Abriendo → congelar el orden actual si aún no está congelado
      if (frozenOrder === null) {
        setFrozenOrder(currentNotifications.map((n) => n.id));
      }
      setExpandedId(id);
    }
  };

  // Intersection Observer for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const notifications = data?.pages.flatMap((page) => page.items) || [];

  // Si hay un orden congelado, mantener ese orden pero usar los datos actualizados del servidor
  const displayNotifications: NotificationEventDto[] = frozenOrder
    ? frozenOrder
        .map((id) => notifications.find((n) => n.id === id))
        .filter((n): n is NotificationEventDto => n !== undefined)
    : notifications;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="animate-spin text-black/30 dark:text-white/30" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/5 dark:bg-white/5">
          <Bell size={20} className="text-black/30 dark:text-white/30" />
        </div>
        <p className="text-sm text-black/50 dark:text-white/50">No tienes notificaciones</p>
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {displayNotifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={
            pendingReadIds.has(notification.id)
              ? { ...notification, isRead: true }
              : notification
          }
          onRead={handleRead}
          onDelete={handleDelete}
          isExpanded={expandedId === notification.id}
          onToggle={() => handleToggle(notification.id, notifications)}
        />
      ))}

      {/* Loading sentinel */}
      <div ref={observerTarget} className="flex justify-center p-4">
        {isFetchingNextPage && (
          <Loader2 size={16} className="animate-spin text-black/30 dark:text-white/30" />
        )}
      </div>
    </div>
  );
}
