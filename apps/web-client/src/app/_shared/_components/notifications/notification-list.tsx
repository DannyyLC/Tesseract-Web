import { useEffect, useRef, useState } from 'react';
import { useInfiniteNotifications, useNotificationMutations } from '@/hooks/useNotifications';
import NotificationItem from './notification-item';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteNotifications();

  const { markAsRead, deleteNotification } = useNotificationMutations();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={(id) => markAsRead.mutate(id)}
          onDelete={handleDelete}
          isExpanded={expandedId === notification.id}
          onToggle={() =>
            setExpandedId((current) => (current === notification.id ? null : notification.id))
          }
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
