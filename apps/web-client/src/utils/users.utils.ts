import { ShieldAlert, Eye, Crown } from 'lucide-react';

export const getRoleConfig = (role: string) => {
  switch (role) {
    case 'OWNER':
      return {
        label: 'Owner',
        color: 'text-[var(--warning-text-adaptive)]',
        selected: 'border-[var(--warning-text-adaptive)] ring-[var(--warning-text-adaptive)]',
        icon: Crown,
      };
    case 'ADMIN':
      return {
        label: 'Admin',
        color: 'text-[var(--danger-text-adaptive)]',
        selected: 'border-[var(--danger-text-adaptive)] ring-[var(--danger-text-adaptive)]',
        icon: ShieldAlert,
      };
    case 'VIEWER':
      return {
        label: 'Viewer',
        color: 'text-[var(--info-text-adaptive)]',
        selected: 'border-[var(--info-text-adaptive)] ring-[var(--info-text-adaptive)]',
        icon: Eye,
      };
    default:
      return {
        label: role,
        color: 'text-[var(--neutral-text-adaptive)]',
        selected: 'border-[var(--neutral-text-adaptive)] ring-[var(--neutral-text-adaptive)]',
        icon: Eye,
      };
  }
};

type Translator = (key: string, params?: Record<string, string | number | Date>) => string;

/** `t` es `useTranslations('Shared.TimeAgo')` del caller — esta función no es un componente. */
export const getStatusConfig = (isActive: boolean, t: Translator) => {
  return isActive
    ? { label: t('active'), color: 'bg-success' }
    : { label: t('inactive'), color: 'bg-neutral-400' };
};

/** `t` es `useTranslations('Shared.TimeAgo')` del caller — esta función no es un componente. */
export const formatTimeAgo = (
  dateInput: Date | string | null,
  t: Translator,
  intlLocale: string,
): string => {
  if (!dateInput) return t('never');

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return t('minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('daysAgo', { count: diffDays });
  return date.toLocaleDateString(intlLocale, { day: '2-digit', month: 'short' });
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
