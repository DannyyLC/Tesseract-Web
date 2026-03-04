import { ShieldAlert, Eye, Crown } from 'lucide-react';

export const getRoleConfig = (role: string) => {
  switch (role) {
    case 'owner':
      return {
        label: 'Owner',
        color: 'text-amber-600 dark:text-amber-400',
        icon: Crown,
      };
    case 'admin':
      return {
        label: 'Admin',
        color: 'text-rose-600 dark:text-rose-400',
        icon: ShieldAlert,
      };
    case 'viewer':
      return {
        label: 'Viewer',
        color: 'text-blue-600 dark:text-blue-400',
        icon: Eye,
      };
    default:
      return {
        label: role,
        color: 'text-zinc-600 dark:text-zinc-400',
        icon: Eye,
      };
  }
};

export const getStatusConfig = (isActive: boolean) => {
  return isActive
    ? { label: 'Activo', color: 'bg-emerald-500' }
    : { label: 'Inactivo', color: 'bg-zinc-400' };
};

export const formatTimeAgo = (dateInput: Date | string | null): string => {
  if (!dateInput) return 'Nunca';
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getAvatarColor = (name: string): string => {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-purple-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-pink-500',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};
