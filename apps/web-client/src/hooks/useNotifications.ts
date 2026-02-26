import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';

// Hook for fetching infinite notifications
export function useInfiniteNotifications(pageSize: number = 10) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'infinite', pageSize],
    queryFn: async ({ pageParam }) => {
      const api = RootApi.getInstance().getNotificationsApi();
      return await api.getNotifications(pageParam as string | undefined, pageSize);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextPageAvailable ? lastPage.nextCursor : undefined;
    },
  });
}

// Hook for fetching unread notifications count
export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const api = RootApi.getInstance().getNotificationsApi();
      return await api.getUnreadCount();
    },
    // Refresh interval can be added here if needed, e.g., refetchInterval: 30000
  });
}

// Hook for notification mutations (Mark as Read, Mark All as Read, Delete)
export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const api = RootApi.getInstance().getNotificationsApi();
      return await api.markAsRead(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getNotificationsApi();
      return await api.markAllAsRead();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const api = RootApi.getInstance().getNotificationsApi();
      return await api.deleteNotification(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return {
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
