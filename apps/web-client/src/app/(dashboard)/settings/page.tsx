'use client';

import React, { useState, useEffect } from 'react';
import { useOrganizationDashboard, useOrganizationMutations } from '@/hooks/useOrganizations';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle, Building2 } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/hooks/useAuth';
import PermissionGuard from '@/components/auth/PermissionGuard';

export default function SettingsPage() {
  const { data: orgData, isLoading, refetch } = useOrganizationDashboard();
  const { data: authUser, isLoading: isLoadingAuth } = useAuth();
  const { updateOrganization, deleteOrganization } = useOrganizationMutations();

  const [name, setName] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const [isAgreed, setIsAgreed] = useState(false);

  // Update local state when data is loaded
  useEffect(() => {
    if (orgData) {
      setName(orgData.name);
    }
  }, [orgData]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre de la organización no puede estar vacío');
      return;
    }

    try {
      await updateOrganization.mutateAsync({ name });
      toast.success('Organización actualizada correctamente');
      refetch();
    } catch (error: any) {
      console.error('Error updating organization:', error);
      toast.error('Error al actualizar la organización');
    }
  };

  const handleDelete = async () => {
    const expectedConfirmation = `${orgData?.name}`;
    if (deleteConfirmation !== expectedConfirmation) {
      toast.error(`Debes escribir exactamente "${expectedConfirmation}"`);
      return;
    }

    if (!isAgreed) {
      toast.error('Debes aceptar que esta acción es irreversible');
      return;
    }

    if (authUser?.twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error('Por favor ingresa el código 2FA de 6 dígitos');
      return;
    }

    try {
      await deleteOrganization.mutateAsync({
        confirmationText: deleteConfirmation,
        code2FA: authUser?.twoFactorEnabled ? code2FA : undefined,
      });
      toast.success('Organización eliminada correctamente');
      setIsDeleteModalOpen(false);
      // Force reload or redirect to login/signup
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Error deleting organization:', error);
      toast.error(error.message || 'Error al eliminar la organización');
    }
  };

  // ... (loading and error states remain the same) ...

  if (isLoading || isLoadingAuth) {
    return <LogoLoader />;
  }

  if (!orgData) {
    return (
      <div className="p-8">
        <p className="text-red-500">Error al cargar la información de la organización.</p>
      </div>
    );
  }

  return (
    <PermissionGuard permissions="organization:delete" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-8 p-6 max-w-5xl">
        <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-2">
          Gestiona los detalles y preferencias de tu organización.
        </p>
      </div>

      {/* General Settings Section */}
      <section className="bg-card space-y-6 rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <Building2 className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">General</h2>
            <p className="text-muted-foreground text-sm">Información básica de tu organización.</p>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="orgName"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Nombre de la Organización
            </label>
            <input
              id="orgName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Ej. Acme Inc."
            />
          </div>

          <div className="flex justify-end pt-2">
            <PermissionGuard permissions="organization:update">
              <button
                type="submit"
                disabled={updateOrganization.isPending || name === orgData.name}
                className="inline-flex h-8 items-center justify-center rounded-xl bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                {updateOrganization.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Cambios'
                )}
              </button>
            </PermissionGuard>
          </div>
        </form>
      </section>

      {/* Danger Zone Section */}
      <PermissionGuard permissions="organization:delete">
        <section className="space-y-6 rounded-2xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/30 dark:bg-red-950/10">
          <div className="flex items-center gap-3 border-b border-red-200 pb-4 dark:border-red-900/30">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
                Zona de Peligro
              </h2>
              <p className="text-sm text-red-700/80 dark:text-red-300/70">
                Acciones irreversibles para tu organización.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-medium text-red-900 dark:text-red-200">Eliminar Organización</h3>
              <p className="text-sm text-red-700/80 dark:text-red-300/70">
                Esta acción eliminará permanentemente tu organización y todos sus datos.
              </p>
            </div>
            <button
              onClick={() => {
                setIsDeleteModalOpen(true);
                setDeleteConfirmation('');
                setCode2FA('');
                setIsAgreed(false);
              }}
              className="focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-transparent px-4 py-2 text-sm font-medium text-red-600 ring-offset-background transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </button>
          </div>
        </section>
      </PermissionGuard>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmation('');
          setCode2FA('');
          setIsAgreed(false);
        }}
        title="¿Estás absolutamente seguro?"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div className="text-sm text-red-800 dark:text-red-200">
                <p className="font-semibold">Esta acción es destructiva e irreversible.</p>
                <p className="mt-1">
                  Se eliminarán permanentemente todos los datos asociados a{' '}
                  <strong>{orgData.name}</strong>, incluyendo workflows, usuarios y configuraciones.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Para confirmar, escribe <strong>{orgData.name}</strong> a continuación:
            </label>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={`${orgData.name}`}
            />
          </div>

          {authUser?.twoFactorEnabled && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Código 2FA</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, ''))}
                className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-center font-mono text-sm tracking-widest ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="000000"
              />
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2 pt-2">
            <input
              type="checkbox"
              checked={isAgreed}
              onChange={(e) => setIsAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-foreground/80 text-sm">
              Entiendo que esta acción es irreversible y eliminará todos los datos de mi
              organización.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmation('');
                setCode2FA('');
                setIsAgreed(false);
              }}
              className="focus-visible:ring-ring border-input hover:text-accent-foreground inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={
                deleteOrganization.isPending ||
                deleteConfirmation !== orgData.name ||
                !isAgreed ||
                (authUser?.twoFactorEnabled && code2FA.length !== 6)
              }
              className="focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white ring-offset-background transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleteOrganization.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Confirmar Eliminación'
              )}
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </PermissionGuard>
  );
}
