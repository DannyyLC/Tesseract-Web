import { ShieldAlert, Eye, Crown } from 'lucide-react';

export const getRoleConfig = (role: string) => {
  switch (role) {
    case 'OWNER':
      return {
        label: 'Owner',
        color: 'text-[var(--warning-text-adaptive)]',
        icon: Crown,
      };
    case 'ADMIN':
      return {
        label: 'Admin',
        color: 'text-[var(--danger-text-adaptive)]',
        icon: ShieldAlert,
      };
    case 'VIEWER':
      return {
        label: 'Viewer',
        color: 'text-[var(--info-text-adaptive)]',
        icon: Eye,
      };
    default:
      return {
        label: role,
        color: 'text-[var(--neutral-text-adaptive)]',
        icon: Eye,
      };
  }
};

export const getStatusConfig = (isActive: boolean) => {
  return isActive
    ? { label: 'Activo', color: 'bg-success' }
    : { label: 'Inactivo', color: 'bg-neutral-400' };
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
    'bg-avatar-blue',
    'bg-avatar-success',
    'bg-avatar-purple',
    'bg-avatar-warning',
    'bg-avatar-danger',
    'bg-avatar-cyan',
    'bg-avatar-indigo',
    'bg-avatar-pink',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};
