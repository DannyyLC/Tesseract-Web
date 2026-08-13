'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Power, PowerOff } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useAdminOrganizationMutations } from '@/hooks/identity/use-admin-organizations';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnGhost, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  org: AdminOrganizationDetail;
}

export function GeneralTab({ org }: Props) {
  const { deactivate, reactivate } = useAdminOrganizationMutations();
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');

  const closeDeactivate = () => {
    setIsDeactivating(false);
    setConfirmName('');
    setReason('');
  };

  // Sin espacios en el borde -copiar y pegar el nombre suele arrastrarlos- pero
  // respetando mayúsculas y acentos: es una confirmación, no una búsqueda.
  const canDeactivate = confirmName.trim() === org.name.trim();

  const handleDeactivate = () => {
    if (!canDeactivate) return;
    deactivate.mutate(
      { id: org.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Organización desactivada');
          closeDeactivate();
        },
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo desactivar'),
      },
    );
  };

  const handleReactivate = () => {
    reactivate.mutate(org.id, {
      onSuccess: () => toast.success('Organización reactivada'),
      onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo reactivar'),
    });
  };

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Información</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-secondary">Nombre</dt>
            <dd className="text-sm text-text-primary">{org.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Slug</dt>
            <dd className="text-sm text-text-primary">{org.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Plan</dt>
            <dd className="text-sm text-text-primary">{org.plan}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Creada</dt>
            <dd className="text-sm text-text-primary">
              {new Date(org.createdAt).toLocaleDateString('es-MX')}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Uso</h2>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-text-secondary">Usuarios</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.users} / {org.planLimits.limits.maxUsers === -1 ? '∞' : org.planLimits.limits.maxUsers}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Workflows</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.workflows} /{' '}
              {org.planLimits.limits.maxWorkflows === -1 ? '∞' : org.planLimits.limits.maxWorkflows}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">API keys</dt>
            <dd className="text-sm text-text-primary">
              {org.usage.apiKeys} /{' '}
              {org.planLimits.limits.maxApiKeys === -1 ? '∞' : org.planLimits.limits.maxApiKeys}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Estado</h2>
        {org.isActive ? (
          <>
            <p className="mb-3 text-sm text-text-secondary">La organización está activa.</p>
            <button
              className="hover:bg-danger/10 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger-600"
              onClick={() => setIsDeactivating(true)}
            >
              <PowerOff size={16} /> Desactivar
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              Desactivada{org.deactivationReason ? `: ${org.deactivationReason}` : ''}.
            </p>
            <button
              className={btnGhost}
              onClick={handleReactivate}
              disabled={reactivate.isPending}
            >
              {reactivate.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Power size={14} />
              )}
              Reactivar
            </button>
          </>
        )}
      </section>

      <Modal isOpen={isDeactivating} onClose={closeDeactivate} title="Desactivar organización">
        <div className="space-y-4">
          <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">
              Los usuarios de la organización no podrán acceder mientras esté desactivada.
            </p>
          </div>

          <div>
            <label className={labelClass}>Motivo (opcional)</label>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>
              Escribe <strong>{org.name}</strong> para confirmar
            </label>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={closeDeactivate} className={btnGhost}>
              Cancelar
            </button>
            <button
              onClick={handleDeactivate}
              disabled={!canDeactivate || deactivate.isPending}
              className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deactivate.isPending && <Loader2 size={16} className="animate-spin" />}
              {deactivate.isPending ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
