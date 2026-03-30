import { useUser } from '@/hooks/useUsers';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface UserDetailsProps {
  userId: string;
}

export function UserDetails({ userId }: UserDetailsProps) {
  const { data: user, isLoading, error } = useUser(userId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin text-black/20 dark:text-white/20" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-4 text-center text-sm text-red-500">
        Error al cargar detalles del usuario.
      </div>
    );
  }

  return (
    <div className="mb-6 mt-2 grid grid-cols-1 gap-8 md:grid-cols-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          ID de Usuario
        </span>
        <p
          className="select-all truncate font-mono text-sm text-black dark:text-white"
          title={user.id}
        >
          {user.id}
        </p>
      </div>

      <div className="flex flex-col gap-1 border-black/5 md:border-l md:pl-8 dark:border-white/5">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          Fecha de Registro
        </span>
        <div className="flex flex-col">
          <p className="text-sm font-medium text-black dark:text-white">
            {new Date(user.createdAt).toLocaleDateString('es-MX', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-black/5 md:border-l md:pl-8 dark:border-white/5">
        <span className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          Verificación
        </span>
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-medium ${user.emailVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
          >
            {user.emailVerified ? 'Email Verificado' : 'Email Pendiente'}
          </p>
          {user.emailVerified ? (
            <CheckCircle size={14} className="text-emerald-500" />
          ) : (
            <XCircle size={14} className="text-amber-500" />
          )}
        </div>
      </div>
    </div>
  );
}
