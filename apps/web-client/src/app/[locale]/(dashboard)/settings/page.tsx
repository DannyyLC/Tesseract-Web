'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganizationDashboard, useOrganizationMutations } from '@/hooks/identity/use-organizations';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle, Building2 } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/hooks/identity/use-auth';
import PermissionGuard from '@/components/auth/permission-guard';

export default function SettingsPage() {
  const t = useTranslations('Settings');
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
      toast.error(t('emptyNameError'));
      return;
    }

    try {
      await updateOrganization.mutateAsync({ name });
      toast.success(t('updateSuccess'));
      refetch();
    } catch (error: any) {
      console.error('Error updating organization:', error);
      toast.error(t('updateError'));
    }
  };

  const handleDelete = async () => {
    const expectedConfirmation = `${orgData?.name}`;
    if (deleteConfirmation !== expectedConfirmation) {
      toast.error(t('writeExactly', { name: expectedConfirmation }));
      return;
    }

    if (!isAgreed) {
      toast.error(t('mustAgreedError'));
      return;
    }

    if (authUser?.twoFactorEnabled && (!code2FA || code2FA.length !== 6)) {
      toast.error(t('code2FARequired'));
      return;
    }

    try {
      await deleteOrganization.mutateAsync({
        confirmationText: deleteConfirmation,
        code2FA: authUser?.twoFactorEnabled ? code2FA : undefined,
      });
      toast.success(t('deleteSuccess'));
      setIsDeleteModalOpen(false);
      // Force reload or redirect to login/signup
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Error deleting organization:', error);
      toast.error(error.message || t('deleteError'));
    }
  };

  // ... (loading and error states remain the same) ...

  if (isLoading || isLoadingAuth) {
    return <LogoLoader />;
  }

  if (!orgData) {
    return (
      <div className="p-8">
        <p className="text-danger">{t('loadError')}</p>
      </div>
    );
  }

  return (
    <PermissionGuard permissions="organization:delete" redirect={true} fallbackRoute="/dashboard">
      <div className="max-w-5xl space-y-8 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('heading')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('description')}
          </p>
        </div>

        {/* General Settings Section */}
        <section className="bg-card space-y-6 rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <Building2 className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('generalTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('generalDesc')}
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="orgName"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t('orgNameLabel')}
              </label>
              <input
                id="orgName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('orgNamePlaceholder')}
              />
            </div>

            <div className="flex justify-end pt-2">
              <PermissionGuard permissions="organization:update">
                <button
                  type="submit"
                  disabled={updateOrganization.isPending || name === orgData.name}
                  className="inline-flex h-8 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateOrganization.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('saving')}
                    </>
                  ) : (
                    t('saveButton')
                  )}
                </button>
              </PermissionGuard>
            </div>
          </form>
        </section>

        {/* Danger Zone Section */}
        <PermissionGuard permissions="organization:delete">
          <section className="space-y-6 rounded-2xl border border-danger-500 bg-danger-500/5 p-6">
            <div className="flex items-center gap-3 border-b border-danger-500 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-500/10 text-danger-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-danger-500">
                  {t('dangerZoneTitle')}
                </h2>
                <p className="text-sm text-danger-500/80">
                  {t('dangerZoneDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-medium text-danger-500">
                  {t('deleteOrgTitle')}
                </h3>
                <p className="text-sm text-danger-500/80">
                  {t('deleteOrgDesc')}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsDeleteModalOpen(true);
                  setDeleteConfirmation('');
                  setCode2FA('');
                  setIsAgreed(false);
                }}
                className="focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md border border-danger-500 bg-transparent px-4 py-2 text-sm font-medium text-danger-500 ring-offset-background transition-colors hover:bg-danger-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteButton')}
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
          title={t('deleteModalTitle')}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-danger-500/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-danger-500" />
                <div className="text-sm text-danger-500">
                  <p className="font-semibold">{t('deleteWarningHeading')}</p>
                  <p className="mt-1">
                    {t('deleteWarningBefore')}{' '}
                    <strong>{orgData.name}</strong>{t('deleteWarningAfter')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('confirmLabelBefore')} <strong>{orgData.name}</strong> {t('confirmLabelAfter')}
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
                <label className="text-sm font-medium text-foreground">{t('code2FALabel')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code2FA}
                  onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, ''))}
                  className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-center font-mono text-sm tracking-widest ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t('codePlaceholder')}
                />
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-2 pt-2">
              <input
                type="checkbox"
                checked={isAgreed}
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-danger-600 focus:ring-danger-500"
              />
              <span className="text-foreground/80 text-sm">
                {t('agreeCheckboxLabel')}
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
                className="focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-text-secondary ring-offset-background transition-colors hover:border-border-hover hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                {t('cancelButton')}
              </button>
              <button
                onClick={handleDelete}
                disabled={
                  deleteOrganization.isPending ||
                  deleteConfirmation !== orgData.name ||
                  !isAgreed ||
                  (authUser?.twoFactorEnabled && code2FA.length !== 6)
                }
                className="focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md bg-danger-500 px-4 py-2 text-sm font-medium text-brand-white ring-offset-background transition-colors hover:bg-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteOrganization.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  t('confirmDeleteButton')
                )}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PermissionGuard>
  );
}
