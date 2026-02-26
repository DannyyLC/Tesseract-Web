'use client';

import React, { useState, useEffect } from 'react';
import { useOrganizationDashboard, useOrganizationMutations } from '@/hooks/useOrganizations';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle, Building2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const router = useRouter();
  const { data: orgData, isLoading, refetch } = useOrganizationDashboard();
  const { data: authUser } = useAuth();
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="p-8">
        <p className="text-red-500">Error al cargar la información de la organización.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-2">
          Gestiona los detalles y preferencias de tu organización.
        </p>
      </div>

      {/* General Settings Section */}
      <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">General</h2>
            <p className="text-sm text-muted-foreground">
              Información básica de tu organización.
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="orgName" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Nombre de la Organización
            </label>
            <input
              id="orgName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Ej. Acme Inc."
            />
          </div>

          <div className="flex justify-end pt-2">
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
          </div>
        </form>
      </section>

      {/* Danger Zone Section */}
      <section className="space-y-6 rounded-2xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/30 dark:bg-red-950/10">
        <div className="flex items-center gap-3 border-b border-red-200 pb-4 dark:border-red-900/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">Zona de Peligro</h2>
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
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-red-200 bg-transparent hover:bg-red-100 text-red-600 h-10 px-4 py-2 dark:border-red-900 dark:hover:bg-red-900/30 dark:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </button>
        </div>
      </section>

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
                  Se eliminarán permanentemente todos los datos asociados a <strong>{orgData.name}</strong>, incluyendo workflows, usuarios y configuraciones.
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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={`${orgData.name}`}
            />
          </div>

          {authUser?.twoFactorEnabled && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Código 2FA
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, ''))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono tracking-widest text-center"
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
            <span className="text-sm text-foreground/80">
              Entiendo que esta acción es irreversible y eliminará todos los datos de mi organización.
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
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
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
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-red-600 text-white hover:bg-red-700 h-10 px-4 py-2 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}
