'use client';

import { WhatsappIcon } from '@/app/_shared/_components/icons/whatsapp-icon';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import { useWhatsappConfigSubscriptions, useWhatsappMutations, useWhatsappNumbers } from '@/hooks/useWhatsapp-config';
import { useWorkflow, useWorkflowMutations } from '@/hooks/useWorkflows';
import { ArrowLeft, BarChart2, Edit3, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import WhatsappNumberCard from '../_components/whatsapp-number-card';
import WorkflowAnalyticsPanel from '../_components/workflow-analytics-panel';

const WHATSAPP_PHONE_REGEX = /^\+\d{8,15}$/;

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Queries
  const { data: workflow, isLoading } = useWorkflow(id);
  const { updateWorkflow, deleteWorkflow } = useWorkflowMutations();

  // UI State
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
  const { deleteWhatsappConfig, setisActiveStatus, addWhatsappConfiguration } = useWhatsappMutations();
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
      toast.error('El nombre no puede estar vacío');
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
      toast.success('Workflow actualizado correctamente');
      setIsEditOpen(false);
    } catch (error) {
      toast.error('Error al actualizar el workflow');
      console.error(error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWorkflow.mutateAsync(id);
      toast.success('Workflow eliminado');
      router.push('/workflows');
    } catch (error) {
      toast.error('Error al eliminar el workflow');
      console.error(error);
    }
  };

  const handleWhatsappDelete = async (id: string) => {
    try {      
      const success = await deleteWhatsappConfig.mutateAsync(id);
      if (success) {
        toast.success('Número de WhatsApp eliminado correctamente');
      } else {
        toast.error('Error al eliminar el número de WhatsApp');
      }
    } catch (error) {
      toast.error('Error al eliminar el número de WhatsApp');
      console.error(error);
    }
    };

  const handleSetWhatsappActiveStatus = async (id: string, isActive: boolean) => {
    try {
      const success = await setisActiveStatus.mutateAsync({ id, data: isActive });
      if (success) {
        toast.success(`Número de WhatsApp ${isActive ? 'activado' : 'desactivado'} correctamente`);
      } else {
        toast.error(`Error al ${isActive ? 'activar' : 'desactivar'} el número de WhatsApp`);
      }
    } catch (error) {
      toast.error(`Error al ${isActive ? 'activar' : 'desactivar'} el número de WhatsApp`);
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
      <div className="flex h-full flex-col items-center justify-center text-black/50 dark:text-white/50">
        <p>Workflow no encontrado</p>
        <Link href="/workflows" className="mt-4 text-blue-500 hover:underline">
          Volver al Dashboard
        </Link>
      </div>
    );
  }

  const handleWhatsappIntegration = async () => {
    if (!isWhatsappNumberValid) {
      toast.error('Ingresa un número válido en formato internacional. Ej: +524961337305');
      return;
    }

    try {
      await addWhatsappConfiguration.mutateAsync({
        workflowId: id,
        phoneNumber: whatsappNumber,
      });
      toast.success('Workflow vinculado a WhatsApp correctamente');
      setIsWhatsappModalOpen(false);
      setWhatsappNumber('');
    } catch (error: any) {
      const statusCode = error?.response?.status;
      const backendMessage =
        (typeof error?.response?.data?.message === 'string' && error.response.data.message.trim()) ||
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
            ? 'Ese número ya está registrado en WhatsApp. Usa otro número o elimina la configuración existente.'
            : backendMessage ||
            'Ese número ya está registrado en WhatsApp. Usa otro número o elimina la configuración existente.',
        );
        console.error(error);
        return;
      }

      toast.error(
        isDuplicatePhoneError
          ? 'Ese número ya está registrado en WhatsApp. Usa otro número o elimina la configuración existente.'
          : backendMessage || 'No se pudo vincular el workflow a WhatsApp. Intenta nuevamente.',
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
                className="group -ml-2 mt-1 shrink-0 rounded-full p-2 text-black/40 transition-all hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5"
              >
                <ArrowLeft
                  size={20}
                  className="transition-transform group-hover:-translate-x-0.5"
                />
              </Link>
              <div className="flex w-full flex-col gap-3">
                <div>
                  <h1 className="flex flex-wrap items-center gap-3 break-words text-3xl font-bold tracking-tight text-black dark:text-white">
                    {workflow.name}
                    {/* Minimal Status Dot */}
                    <div
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                        workflow.isActive
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-zinc-500/20 bg-zinc-500/5'
                      }`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                      />
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wide ${workflow.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                      >
                        {workflow.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </h1>
                  <p className="mt-2 max-w-3xl break-words text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/60">
                    {workflow.description || 'Sin descripción'}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-8">
                  <div className="flex flex-col">
                    <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">
                      Categoría
                    </span>
                    <span className="text-sm font-medium capitalize text-black dark:text-white">
                      {workflow.category || 'Standard'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">
                      Versión
                    </span>
                    <span className="font-mono text-sm font-medium text-black dark:text-white">
                      v{workflow.version || 1}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">
                      Creado
                    </span>
                    <span className="text-sm font-medium text-black dark:text-white">
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
                  className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-black px-5 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-95 xl:w-auto dark:bg-white dark:text-black"
                >
                  <MessageSquare size={17} className="shrink-0" />
                  Probar Chat
                </Link>
              </PermissionGuard>

              <button
                onClick={() => setIsWhatsappModalOpen(true)}
                className="group flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-black transition-all hover:bg-black/5 active:scale-95 xl:min-w-[230px] xl:w-auto dark:border-white/10 dark:bg-[#141414] dark:text-white dark:hover:bg-white/5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-black/70 transition-colors group-hover:bg-black/10 dark:bg-white/10 dark:text-white/80 dark:group-hover:bg-white/15">
                  <WhatsappIcon className="h-4 w-4" />
                </span>
                Vincular a WhatsApp
              </button>

              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => setIsEditOpen(true)}
                  className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-black transition-all hover:bg-black/5 active:scale-95 xl:w-auto dark:border-white/10 dark:bg-[#141414] dark:text-white dark:hover:bg-white/5"
                >
                  <Edit3 size={17} className="shrink-0" />
                  Editar
                </button>
              </PermissionGuard>
            </div>
          </div>
        </div>
        </div>

        <div className="h-px w-full bg-black/5 dark:bg-white/5" />

        {/* Main Content - Analytics */}
        <div className="space-y-8 px-8 py-8">
          <div className="flex items-center gap-2 text-black dark:text-white">
            <BarChart2 size={24} />
            <h2 className="text-xl font-bold">Análisis de Rendimiento</h2>
          </div>

          <WorkflowAnalyticsPanel workflow={workflow} />
        </div>

        <div className="border-t border-black/5 px-8 py-8 dark:border-white/5">

          <div className="mb-8 rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <h3 className="ml-1 text-sm font-semibold text-black dark:text-white">Números de WhatsApp Business Asociados</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {isWhatsappNumbersLoading ? (
                <div className="flex min-h-28 items-center justify-center rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#141414]">
                  <Loader2 size={20} className="animate-spin text-black/50 dark:text-white/50" />
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
                <p className="ml-1 text-sm text-black/65 dark:text-white/65">No hay números de WhatsApp asociados a este workflow. Vincula un número para comenzar a recibir mensajes.</p>
              )}
            </div>
          </div>


          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4 dark:bg-red-500/[0.08]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de peligro</h3>
                <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
                  Eliminar este workflow es una acción irreversible y removerá su historial.
                </p>
              </div>

              <PermissionGuard permissions="workflows:delete">
                <button
                  onClick={() => setIsDeleteOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-500/10 active:scale-95 lg:w-auto dark:border-red-400/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={16} />
                  Eliminar workflow
                </button>
              </PermissionGuard>
            </div>
          </div>

        
              
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Editar Workflow">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-black dark:text-white">Nombre</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-transparent bg-black/5 px-3 py-2 text-black outline-none transition-all focus:border-blue-500 focus:bg-white dark:bg-white/5 dark:text-white dark:focus:bg-black"
              placeholder="Nombre del workflow"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black dark:text-white">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[100px] w-full rounded-xl border border-transparent bg-black/5 px-3 py-2 text-black outline-none transition-all focus:border-blue-500 focus:bg-white dark:bg-white/5 dark:text-white dark:focus:bg-black"
              placeholder="Descripción opcional"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-black/5 p-3 dark:bg-white/5">
            <span className="text-sm font-medium text-black dark:text-white">Estado Activo</span>
            <button
              onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
              className={`relative h-6 w-11 rounded-full transition-colors ${formData.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.isActive ? 'translate-x-[22px]' : 'translate-x-1'}`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsEditOpen(false)}
              className="flex-1 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpdate}
              disabled={updateWorkflow.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
            >
              {updateWorkflow.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Guardar Cambios'
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
        title="Eliminar Workflow"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Trash2 size={16} />
              ¿Estás absolutamente seguro?
            </p>
            <p className="opacity-90">
              Esta acción eliminará permanentemente el workflow <strong>{workflow.name}</strong> y
              todo su historial.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-black/70 dark:text-white/70">
              Escribe{' '}
              <span className="select-all font-bold text-black dark:text-white">
                {workflow.name}
              </span>{' '}
              para confirmar:
            </label>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="w-full rounded-xl border border-transparent bg-black/5 px-3 py-2 text-black outline-none transition-all focus:border-red-500 focus:bg-white dark:bg-white/5 dark:text-white dark:focus:bg-black"
              placeholder={workflow.name}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setIsDeleteOpen(false);
                setDeleteConfirmation('');
              }}
              className="flex-1 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteWorkflow.isPending || deleteConfirmation !== workflow.name}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteWorkflow.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Sí, Eliminar'
              )}
            </button>
          </div>
        </div>
      </Modal>


      <Modal isOpen={isWhatsappModalOpen} onClose={() => setIsWhatsappModalOpen(false)} title="Vincular workflow a WhatsApp">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-start gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/80">
                <WhatsappIcon className="h-4 w-4" />
              </span>
              <label className="text-sm font-medium text-black dark:text-white">Numero de WhatsApp</label>
            </div>

            <p className="rounded-xl border border-black/5 bg-black/[0.02] p-3 text-xs leading-relaxed text-black/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65">
              Cuando envies esta solicitud, el equipo te ayudara a finalizar la integracion en
              Ycloud para habilitar eventos entrantes de WhatsApp. Si necesitas atencion inmediata,
              puedes contactarnos al +52 449 129 24 35.
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
              className="w-full rounded-xl border border-transparent bg-black/5 px-3 py-2 text-black outline-none transition-all focus:border-blue-500 focus:bg-white dark:bg-white/5 dark:text-white dark:focus:bg-black"
              placeholder="Ej. +52234567890"
            />
            {whatsappNumber.length > 11 && !isWhatsappNumberValid && (
              <p className="text-sm text-red-500 dark:text-red-400">
                Usa solo numeros con prefijo internacional, por ejemplo: +524961337305
              </p>
            )}
          </div>
          
        
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsWhatsappModalOpen(false)}
              className="flex-1 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={handleWhatsappIntegration}
              disabled={addWhatsappConfiguration.isPending || !isWhatsappNumberValid}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
            >
              {addWhatsappConfiguration.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Enviar Solicitud'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </PermissionGuard>
  );
}
