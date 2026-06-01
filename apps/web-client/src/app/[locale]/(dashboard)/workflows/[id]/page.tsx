'use client';

import { WhatsappIcon } from '@/components/icons/whatsapp-icon';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import PermissionGuard from '@/components/auth/permission-guard';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import {
  useWhatsappConfigSubscriptions,
  useWhatsappMutations,
  useWhatsappNumbers,
} from '@/hooks/messaging/use-whatsapp-config';
import { useWorkflow, useWorkflowMutations } from '@/hooks/automation/use-workflows';
import { ArrowLeft, BarChart2, Edit3, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/routing';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import WhatsappNumberCard from '../_components/whatsapp-number-card';
import WorkflowAnalyticsPanel from '../_components/workflow-analytics-panel';
import WorkflowExecutionsTable from '../_components/workflow-executions-table';
import { useTranslations } from 'next-intl';

const WHATSAPP_PHONE_REGEX = /^\+\d{8,15}$/;

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useTranslations('WorkflowDetail');

  // Queries
  const { data: workflow, isLoading } = useWorkflow(id);
  const { updateWorkflow, deleteWorkflow } = useWorkflowMutations();

  // UI State
  const [period, setPeriod] = useState('30d');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isWhatsappModalOpen, setIsWhatsappModalOpen] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: false,
  });

  const { data: whatsappNumbers, isLoading: isWhatsappNumbersLoading } = useWhatsappNumbers(id);
  const { deleteWhatsappConfig, setisActiveStatus, addWhatsappConfiguration } =
    useWhatsappMutations();
  useWhatsappConfigSubscriptions();

  // Initialize form when workflow loads
  useEffect(() => {
    if (workflow) {
      setFormData({
        name: workflow.name,
        description: workflow.description || '',
        isActive: workflow.isActive,
      });
    }
  }, [workflow]);

  const isWhatsappNumberValid = WHATSAPP_PHONE_REGEX.test(whatsappNumber);

  // Handlers
  const handleUpdate = async () => {
    if (!formData.name.trim()) {
      toast.error(t('emptyNameError'));
      return;
    }

    try {
      await updateWorkflow.mutateAsync({
        id,
        data: {
          name: formData.name,
          description: formData.description,
          isActive: formData.isActive,
        },
      });
      toast.success(t('updateSuccess'));
      setIsEditOpen(false);
    } catch (error) {
      toast.error(t('updateError'));
      console.error(error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWorkflow.mutateAsync(id);
      toast.success(t('deleteSuccess'));
      router.push('/workflows');
    } catch (error) {
      toast.error(t('deleteError'));
      console.error(error);
    }
  };

  const handleWhatsappDelete = async (id: string) => {
    try {
      const success = await deleteWhatsappConfig.mutateAsync(id);
      if (success) {
        toast.success(t('whatsappDeleteSuccess'));
      } else {
        toast.error(t('whatsappDeleteError'));
      }
    } catch (error) {
      toast.error(t('whatsappDeleteError'));
      console.error(error);
    }
  };

  const handleSetWhatsappActiveStatus = async (id: string, isActive: boolean) => {
    try {
      const success = await setisActiveStatus.mutateAsync({ id, data: isActive });
      if (success) {
        toast.success(isActive ? t('whatsappActivated') : t('whatsappDeactivated'));
      } else {
        toast.error(isActive ? t('whatsappActivateError') : t('whatsappDeactivateError'));
      }
    } catch (error) {
      toast.error(isActive ? t('whatsappActivateError') : t('whatsappDeactivateError'));
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-secondary">
        <p>{t('notFound')}</p>
        <Link href="/workflows" className="mt-4 text-info hover:underline">
          {t('backToDashboard')}
        </Link>
      </div>
    );
  }

  const handleWhatsappIntegration = async () => {
    if (!isWhatsappNumberValid) {
      toast.error(t('invalidNumberError'));
      return;
    }

    try {
      await addWhatsappConfiguration.mutateAsync({
        workflowId: id,
        phoneNumber: whatsappNumber,
      });
      toast.success(t('whatsappLinkSuccess'));
      setIsWhatsappModalOpen(false);
      setWhatsappNumber('');
    } catch (error: any) {
      const statusCode = error?.response?.status;
      const backendMessage =
        (typeof error?.response?.data?.message === 'string' &&
          error.response.data.message.trim()) ||
        (typeof error?.message === 'string' && error.message.trim()) ||
        '';
      const normalizedMessage = backendMessage.toLowerCase();
      const isDuplicatePhoneError =
        normalizedMessage.includes('whatsapp config') &&
        normalizedMessage.includes('phone number') &&
        normalizedMessage.includes('already exists');

      if (statusCode === 409) {
        toast.error(
          isDuplicatePhoneError
            ? t('duplicatePhoneError')
            : backendMessage || t('duplicatePhoneError'),
        );
        console.error(error);
        return;
      }

      toast.error(
        isDuplicatePhoneError ? t('duplicatePhoneError') : backendMessage || t('whatsappLinkError'),
      );
      console.error(error);
    }
  };

  return (
    <PermissionGuard permissions="workflows:read" redirect={true} fallbackRoute="/workflows">
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="w-full space-y-8 px-6 py-8">
          {/* Header Section */}
          <div className="flex flex-col gap-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div className="flex w-full items-start gap-4 md:w-auto">
                <Link
                  href="/workflows"
                  className="group -ml-2 mt-1 shrink-0 rounded-full p-2 text-text-tertiary transition-all hover:bg-[var(--surface-tint)]"
                >
                  <ArrowLeft
                    size={20}
                    className="transition-transform group-hover:-translate-x-0.5"
                  />
                </Link>
                <div className="flex w-full flex-col gap-3">
                  <div>
                    <h1 className="flex flex-wrap items-center gap-3 break-words text-3xl font-bold tracking-tight text-text-primary">
                      {workflow.name}
                      <div
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                          workflow.isActive
                            ? 'bg-success-500/5 border-[var(--success-text-adaptive)]'
                            : 'bg-neutral-500/5 border-[var(--neutral-text-adaptive)]'
                        }`}
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${workflow.isActive ? 'bg-success-500' : 'bg-neutral-500'}`}
                        />
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wide ${workflow.isActive ? 'text-[var(--success-text-adaptive)]' : 'text-[var(--neutral-text-adaptive)]'}`}
                        >
                          {workflow.isActive ? t('statusActive') : t('statusInactive')}
                        </span>
                      </div>
                    </h1>
                    <p className="mt-2 max-w-3xl break-words text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                      {workflow.description || t('noDescription')}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-8">
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        {t('categoryLabel')}
                      </span>
                      <span className="text-sm font-medium capitalize text-text-primary">
                        {workflow.category || 'Standard'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        {t('versionLabel')}
                      </span>
                      <span className="font-mono text-sm font-medium text-text-primary">
                        v{workflow.version || 1}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        {t('createdLabel')}
                      </span>
                      <span className="text-sm font-medium text-text-primary">
                        {new Date(workflow.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
                <PermissionGuard permissions="workflows:execute">
                  <Link
                    href={`/conversations/new?workflowId=${workflow.id}`}
                    className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-5 text-sm font-medium text-text-inverse shadow-sm transition-all hover:opacity-90 active:scale-95 xl:w-auto"
                  >
                    <MessageSquare size={17} className="shrink-0" />
                    {t('testChat')}
                  </Link>
                </PermissionGuard>

                <button
                  onClick={() => setIsWhatsappModalOpen(true)}
                  className="group flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-surface-elevated px-5 text-sm font-medium text-text-primary transition-all hover:bg-[var(--surface-tint)] active:scale-95 xl:w-auto xl:min-w-[230px]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-tint)] text-text-secondary transition-colors group-hover:bg-surface-secondary">
                    <WhatsappIcon className="h-4 w-4" />
                  </span>
                  {t('linkWhatsapp')}
                </button>

                <PermissionGuard permissions="workflows:update">
                  <button
                    onClick={() => setIsEditOpen(true)}
                    className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface-elevated px-4 text-sm font-medium text-text-primary transition-all hover:bg-[var(--surface-tint)] active:scale-95 xl:w-auto"
                  >
                    <Edit3 size={17} className="shrink-0" />
                    {t('editButton')}
                  </button>
                </PermissionGuard>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-surface-secondary" />

        {/* Main Content - Analytics */}
        <div className="space-y-8 px-8 py-8">
          <div className="flex items-center gap-2 text-text-primary">
            <BarChart2 size={24} />
            <h2 className="text-xl font-bold">{t('performanceAnalysis')}</h2>
          </div>

          <WorkflowAnalyticsPanel workflow={workflow} period={period} onPeriodChange={setPeriod} />
        </div>

        <div className="space-y-4 px-8 pb-8">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            {t('periodExecutions')}
          </h3>
          <WorkflowExecutionsTable workflowId={id} period={period} />
        </div>

        <div className="border-t border-[var(--border-subtle)] px-8 py-8">
          <div className="mb-8 rounded-2xl border border-border bg-[var(--surface-subtle)] p-4">
            <h3 className="ml-1 text-sm font-semibold text-text-primary">
              {t('connectedIntegrations')}
            </h3>
            <div className="mt-4 flex flex-wrap gap-4">
              {workflow.tenantTools && workflow.tenantTools.length > 0 ? (
                workflow.tenantTools.map((tool: any) => (
                  <div
                    key={tool.id}
                    className="flex min-w-[250px] flex-1 items-center gap-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-sm transition-all hover:border-border-hover hover:shadow-md"
                  >
                    {tool.toolCatalog?.icon ? (
                      <DynamicIcon
                        name={tool.toolCatalog.icon}
                        size={32}
                        className="shrink-0 text-text-primary"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-secondary">
                        <span className="text-xs font-bold text-text-secondary">
                          {tool.toolCatalog?.displayName?.charAt(0) ||
                            tool.displayName?.charAt(0) ||
                            'T'}
                        </span>
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {tool.displayName}
                      </span>
                      <span className="truncate text-xs text-text-secondary">
                        {tool.toolCatalog?.displayName || 'Integración'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ml-1 text-sm text-[var(--text-muted)]">{t('noIntegrations')}</p>
              )}
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-border bg-[var(--surface-subtle)] p-4">
            <h3 className="ml-1 text-sm font-semibold text-text-primary">
              {t('whatsappNumbersTitle')}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {isWhatsappNumbersLoading ? (
                <div className="flex min-h-28 items-center justify-center rounded-2xl border border-border bg-surface-elevated">
                  <Loader2 size={20} className="animate-spin text-text-secondary" />
                </div>
              ) : whatsappNumbers && whatsappNumbers.length > 0 ? (
                whatsappNumbers.map((number, index) => (
                  <div
                    key={number.id}
                    className={
                      whatsappNumbers.length % 2 !== 0 && index === whatsappNumbers.length - 1
                        ? 'lg:col-span-2'
                        : ''
                    }
                  >
                    <WhatsappNumberCard
                      number={{
                        id: number.id,
                        phoneNumber: number.phoneNumber,
                        connectionStatus: number.connectionStatus,
                        createdAt: number.createdAt.toString(),
                      }}
                      index={index}
                      onDelete={handleWhatsappDelete}
                      onSetActiveStatus={handleSetWhatsappActiveStatus}
                      isActive={number.isActive}
                    />
                  </div>
                ))
              ) : (
                <p className="ml-1 text-sm text-[var(--text-muted)]">{t('noWhatsappNumbers')}</p>
              )}
            </div>
          </div>

          <div className="bg-danger-500/5 rounded-2xl border border-danger-500 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-danger-500">{t('dangerZone')}</h3>
                <p className="text-danger-500/80 mt-1 text-sm">{t('deleteDesc')}</p>
              </div>

              <PermissionGuard permissions="workflows:delete">
                <button
                  onClick={() => setIsDeleteOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-500 bg-transparent px-4 py-2.5 text-sm font-medium text-danger-500 transition-all hover:bg-danger-500 hover:text-brand-white active:scale-95 lg:w-auto"
                >
                  <Trash2 size={16} />
                  {t('deleteWorkflowButton')}
                </button>
              </PermissionGuard>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={t('editModalTitle')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">{t('nameLabel')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
              placeholder={t('namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">{t('descriptionLabel')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[100px] w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
              placeholder={t('descriptionPlaceholder')}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-tint)] p-3">
            <span className="text-sm font-medium text-text-primary">{t('activeStatus')}</span>
            <button
              onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
              className={`relative h-6 w-11 rounded-full transition-colors ${formData.isActive ? 'bg-success-500' : 'bg-[var(--toggle-off-bg)]'}`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-brand-white shadow-sm transition-transform ${formData.isActive ? 'translate-x-[22px]' : 'translate-x-1'}`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsEditOpen(false)}
              className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleUpdate}
              disabled={updateWorkflow.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {updateWorkflow.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t('saveButton')
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeleteConfirmation('');
        }}
        title={t('deleteModalTitle')}
      >
        <div className="space-y-4">
          <div className="border-danger-500/20 bg-danger/10 rounded-xl border p-4 text-sm text-[var(--danger-text-adaptive)]">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Trash2 size={16} />
              {t('deleteConfirmHeading')}
            </p>
            <p className="opacity-90">
              {t('deleteConfirmBefore')} <strong>{workflow.name}</strong> {t('deleteConfirmAfter')}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-primary">
              {t('writeLabelPrefix')}{' '}
              <span className="select-all font-bold text-text-primary">{workflow.name}</span>{' '}
              {t('writeLabelSuffix')}
            </label>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-danger-500 focus:bg-surface"
              placeholder={workflow.name}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setIsDeleteOpen(false);
                setDeleteConfirmation('');
              }}
              className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteWorkflow.isPending || deleteConfirmation !== workflow.name}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-brand-white transition-all hover:bg-danger-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteWorkflow.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t('confirmDeleteButton')
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp Modal */}
      <Modal
        isOpen={isWhatsappModalOpen}
        onClose={() => setIsWhatsappModalOpen(false)}
        title={t('whatsappModalTitle')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-start gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint)] text-text-secondary">
                <WhatsappIcon className="h-4 w-4" />
              </span>
              <label className="text-sm font-medium text-text-primary">{t('whatsappLabel')}</label>
            </div>

            <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-xs leading-relaxed text-[var(--text-muted)]">
              {t('whatsappInstruction')}
            </p>

            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => {
                const sanitizedValue = e.target.value
                  .replace(/(?!^)\+/g, '')
                  .replace(/[^+\d]/g, '');

                setWhatsappNumber(sanitizedValue);
              }}
              inputMode="tel"
              autoComplete="tel"
              pattern="^\+\d{8,15}$"
              maxLength={16}
              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2 text-text-primary outline-none transition-all focus:border-info-500 focus:bg-surface"
              placeholder="Ej. +52234567890"
            />
            {whatsappNumber.length > 11 && !isWhatsappNumberValid && (
              <p className="text-sm text-[var(--danger-text-adaptive)]">{t('phoneFormatError')}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsWhatsappModalOpen(false)}
              className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleWhatsappIntegration}
              disabled={addWhatsappConfiguration.isPending || !isWhatsappNumberValid}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {addWhatsappConfiguration.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t('sendRequest')
              )}
            </button>
          </div>
        </div>
      </Modal>
    </PermissionGuard>
  );
}
