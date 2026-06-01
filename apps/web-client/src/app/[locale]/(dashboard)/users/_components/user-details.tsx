import { useUser } from '@/hooks/identity/use-users';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface UserDetailsProps {
  userId: string;
}

export function UserDetails({ userId }: UserDetailsProps) {
  const t = useTranslations('Users');
  const { data: user, isLoading, error } = useUser(userId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-4 text-center text-sm text-danger">
        {t('loadDetailsError')}
      </div>
    );
  }

  return (
    <div className="mb-6 mt-2 grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {t('registrationDate')}
        </span>
        <div className="flex flex-col">
          <p className="text-sm font-medium text-text-primary">
            {new Date(user.createdAt).toLocaleDateString('es-MX', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-border md:border-l md:pl-8">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {t('verification')}
        </span>
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-medium ${user.emailVerified ? 'text-success-600' : 'text-warning-600'}`}
          >
            {user.emailVerified ? t('emailVerified') : t('emailPending')}
          </p>
          {user.emailVerified ? (
            <CheckCircle size={14} className="text-success-500" />
          ) : (
            <XCircle size={14} className="text-warning-500" />
          )}
        </div>
      </div>
    </div>
  );
}
