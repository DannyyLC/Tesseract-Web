'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Edit3, BarChart2, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useWorkflow, useWorkflowMutations } from '@/hooks/useWorkflows';
import { LogoLoader } from '@/components/ui/logo-loader';
import WorkflowAnalyticsPanel from '../_components/workflow-analytics-panel';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { WhatsappIcon } from '@/app/_shared/_components/icons/whatsapp-icon';

const WHATSAPP_PHONE_REGEX = /^\+\d{8,15}$/;

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Queries
  const { data: workflow, isLoading } = useWorkflow(id);
  const { updateWorkflow, deleteWorkflow, addWhatsappConfiguration } = useWorkflowMutations();

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
      toast.success('Workflow asociado a WhatsApp correctamente');
      setIsWhatsappModalOpen(false);
      setWhatsappNumber('');
    } catch (error) {
      toast.error('Error al asociar el workflow a WhatsApp (verifica que el número no esté ya registrado)');
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
                  <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-black dark:text-white">
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
                  <p className="mt-2 max-w-2xl text-lg leading-relaxed text-black/60 dark:text-white/60">
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

            <div className="flex w-full items-center gap-3 md:w-auto">
              <PermissionGuard permissions="workflows:execute">
                <Link
                  href={`/conversations/new?workflowId=${workflow.id}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-95 md:flex-none dark:bg-white dark:text-black"
                >
                  <MessageSquare size={16} />
                  Probar Chat
                </Link>
              </PermissionGuard>

              <PermissionGuard permissions="workflows:update">
                <button
                  onClick={() => setIsEditOpen(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-black transition-all hover:bg-black/5 active:scale-95 md:flex-none dark:border-white/10 dark:bg-[#141414] dark:text-white dark:hover:bg-white/5"
                >
                  <Edit3 size={16} />
                  Editar
                </button>
              </PermissionGuard>

              <PermissionGuard permissions="workflows:delete">
                <button
                  onClick={() => setIsDeleteOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-white text-black/30 transition-all hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-500 dark:bg-[#141414] dark:text-white/30"
                  title="Eliminar Workflow"
                >
                  <Trash2 size={18} />
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


      <div className="space-y-8 px-8 py-8 flex justify-end">

          <button
            onClick={() => setIsWhatsappModalOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-black px-6 py-2.5 font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-95 md:flex-none dark:bg-white dark:text-black">
            <div className='flex items-center gap-4'>
              <WhatsappIcon className="w-8 h-8" />
              <span>
                Asociar Workflow a WhatsApp
              </span>
            </div>
          </button>
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


      <Modal isOpen={isWhatsappModalOpen} onClose={() => setIsWhatsappModalOpen(false)} title="Asociar Workflow a WhatsApp">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className='flex items-center gap-2 justify-start'>
              <WhatsappIcon className="w-8 h-8 mr-2" />
              <label className="text-sm font-medium text-black dark:text-white">Numero de Whatsapp a Asociar</label>
            </div>
             <span className="text-sm font-medium text-black/70 dark:text-white/70">Una vez registrado, uno de nuestros empleados le dara seguimiento a esta operación y te ayudara a terminar de configurar la integración a través de la plataforma <b>Ycloud</b> para escuchar los eventos que lleguen a tu número asociado. La notificación a nuestros empleados será enviada y tan pronto como sea posible se te contactara, aun asi si deseas inmediata atención puedes contactarnos a través de Whatsapp al número +52449-129-24-35</span>

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
                  Usa solo números con prefijo internacional, por ejemplo: +524961337305
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
