'use client';

import { useState, useEffect } from 'react';
import { Loader2, KeyRound, CheckCircle2, Check } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useTenantToolMutations } from '@/hooks/tools/useTenantTools';
import { GetToolsDto } from '@tesseract/types';
import { toast } from 'sonner';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { DynamicIcon } from '@/components/ui/dynamic-icon';

interface ConnectToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** If provided, we are connecting a NEW tool from the catalog */
  catalogTool?: GetToolsDto | null;
  /** If provided, we are reconfiguring an EXISTING tool */
  existingToolId?: string | null;
  existingToolDisplayName?: string | null;
  existingToolProvider?: string | null;
}

export function ConnectToolModal({
  isOpen,
  onClose,
  catalogTool,
  existingToolId,
  existingToolDisplayName,
  existingToolProvider,
}: ConnectToolModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const { createTenantTool } = useTenantToolMutations();

  const provider = catalogTool?.provider || existingToolProvider || 'none';
  const isGoogle = provider.toLowerCase() === 'google';
  const functions = catalogTool?.functions || [];

  useEffect(() => {
    if (isOpen) {
      setDisplayName(catalogTool?.displayName || existingToolDisplayName || '');
      setSelectedFunctions(functions.map((f) => f.functionName));
      setIsSuccess(false);
    }
  }, [isOpen, catalogTool, existingToolDisplayName]);

  const toggleFunction = (name: string) => {
    setSelectedFunctions((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const toggleAll = () => {
    if (selectedFunctions.length === functions.length) {
      setSelectedFunctions([]);
    } else {
      setSelectedFunctions(functions.map((f) => f.functionName));
    }
  };

  const handleConnect = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error('Por favor ingresa un nombre para la herramienta.');
      return;
    }

    if (selectedFunctions.length === 0 && functions.length > 0) {
      toast.error('Debes seleccionar al menos una función.');
      return;
    }

    try {
      let tenantToolId = existingToolId;

      if (!tenantToolId && catalogTool) {
        // Step 1: Create the tenant tool record
        const created = await createTenantTool.mutateAsync({
          toolCatalogId: catalogTool.id,
          displayName: trimmed,
          allowedFunctions: selectedFunctions,
        });

        if (!created) throw new Error('Error creating tool');
        tenantToolId = (created as any).id;
      }

      if (!tenantToolId) throw new Error('No tenant tool ID found');

      // Step 2: Handle Provider Auth logic
      if (provider === 'none') {
        toast.success('Herramienta conectada correctamente.');
        setIsSuccess(true);
        setTimeout(onClose, 2500);
      } else {
        toast.info(`Redirigiendo a ${provider}...`);
        const oauthApi = RootApi.getInstance().getToolsOauthApi();
        oauthApi.redirectToGoogleAuth(tenantToolId);
      }
    } catch (error: any) {
      console.error('Connection error:', error);

      const statusCode = error?.response?.status;
      const backendMessage =
        (typeof error?.message === 'string' && error.message.trim()) ||
        (typeof error?.response?.data?.message === 'string' && error.response.data.message.trim()) ||
        '';

      if (statusCode === 409) {
        toast.error(
          backendMessage ||
            'Ya existe una herramienta activa con ese nombre. Intenta con otro nombre.',
        );
        return;
      }

      if (backendMessage && !error?.toastHandled) {
        toast.error(backendMessage);
        return;
      }

      toast.error('Ocurrió un error al intentar conectar la herramienta.');
    }
  };

  const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        existingToolId
          ? 'Configurar credenciales'
          : `Conectar ${catalogTool?.displayName || 'Herramienta'}`
      }
    >
      <div className="space-y-6 py-2">
        {isSuccess ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-8 text-center">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <h3 className="text-lg font-semibold text-black dark:text-white">¡Listo!</h3>
            <p className="text-sm text-black/50 dark:text-white/50">
              La herramienta ha sido configurada correctamente.
            </p>
          </div>
        ) : (
          <>
            {/* Step 1: Naming */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50 dark:text-white/50">
                Nombre de la instancia
              </label>
              <input
                autoFocus
                type="text"
                placeholder="Nombre de la herramienta"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-black outline-none transition-all focus:border-black/20 focus:ring-2 focus:ring-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
              />
            </div>

            {/* Step 2: Functions selection */}
            {functions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-black/50 dark:text-white/50">
                    Habilitar funciones
                  </label>
                  <button
                    onClick={toggleAll}
                    className="text-[10px] font-bold uppercase tracking-wider text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                  >
                    {selectedFunctions.length === functions.length
                      ? 'Desmarcar todas'
                      : 'Marcar todas'}
                  </button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {functions.map((fn) => (
                    <button
                      key={fn.id}
                      onClick={() => toggleFunction(fn.functionName)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        selectedFunctions.includes(fn.functionName)
                          ? 'border-black/20 bg-black/5 dark:border-white/20 dark:bg-white/5'
                          : 'border-black/5 bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          selectedFunctions.includes(fn.functionName)
                            ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                            : 'border-black/20 bg-white dark:border-white/20 dark:bg-white/5'
                        }`}
                      >
                        {selectedFunctions.includes(fn.functionName) && (
                          <Check size={12} strokeWidth={3} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={fn.icon}
                            size={14}
                            className="text-black/40 dark:text-white/40"
                          />
                          <p className="truncate text-xs font-semibold text-black dark:text-white">
                            {fn.displayName}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-black/40 dark:text-white/40">
                          {fn.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Provider Connection */}
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/10">
                  {catalogTool ? (
                    <DynamicIcon name={catalogTool.icon} size={24} />
                  ) : (
                    <KeyRound size={20} className="text-black/50 dark:text-white/50" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-black dark:text-white">
                    {catalogTool?.displayName || existingToolDisplayName}
                  </h4>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    Proveedor: {provider === 'none' ? 'Ninguno (Herramienta local)' : provider}
                  </p>
                </div>
              </div>

              {provider !== 'none' ? (
                <button
                  onClick={handleConnect}
                  disabled={createTenantTool.isPending}
                  className={`flex w-full items-center justify-center gap-3 rounded-xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 ${
                    isGoogle
                      ? 'bg-[#4285F4] text-white'
                      : 'bg-black text-white dark:bg-white dark:text-black'
                  }`}
                >
                  {createTenantTool.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      {isGoogle ? <GoogleIcon /> : <KeyRound size={18} />}
                      {existingToolId ? 'Re-conectar con' : 'Conectar con'}{' '}
                      {isGoogle ? 'Google' : provider}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={createTenantTool.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-semibold text-white transition-all hover:opacity-90 dark:bg-white dark:text-black"
                >
                  {createTenantTool.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    'Finalizar configuración'
                  )}
                </button>
              )}
            </div>

            <p className="text-center text-[11px] leading-relaxed text-black/30 dark:text-white/30">
              {provider !== 'none'
                ? 'Al conectar, autorizas a Tesseract para acceder a los datos necesarios para ejecutar los workflows configurados.'
                : 'Esta herramienta no requiere credenciales externas para funcionar.'}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
