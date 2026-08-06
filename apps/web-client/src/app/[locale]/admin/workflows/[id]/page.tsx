'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Boxes,
  CheckCircle2,
  FileJson,
  GitBranch,
  History,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Save,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  useAdminWorkflow,
  useAdminWorkflowMutations,
  useEditorContext,
} from '@/hooks/automation/use-admin-workflows';
import {
  diffLocal,
  isEqualConfig,
  lintConfig,
  type WorkflowConfig,
} from '@/lib/workflow-config/config-edit';
import { AgentsTab } from '@/components/admin/workflows/agents-tab';
import { NodesTab } from '@/components/admin/workflows/nodes-tab';
import { GraphTab } from '@/components/admin/workflows/graph-tab';
import { MediaTab } from '@/components/admin/workflows/media-tab';
import { RawJsonTab } from '@/components/admin/workflows/raw-json-tab';
import { HistoryTab } from '@/components/admin/workflows/history-tab';
import { SettingsTab } from '@/components/admin/workflows/settings-tab';
import { btnGhost, btnPrimary, inputClass, labelClass } from '../../_styles';

type TabId = 'agents' | 'nodes' | 'graph' | 'media' | 'json' | 'settings' | 'history';

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'nodes', label: 'Nodos', icon: Boxes },
  { id: 'graph', label: 'Grafo', icon: GitBranch },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'json', label: 'JSON', icon: FileJson },
  { id: 'settings', label: 'Ajustes', icon: SlidersHorizontal },
  { id: 'history', label: 'Historial', icon: History },
];

const draftKey = (id: string, version: number) => `wf-draft:${id}:${version}`;

/**
 * Borra los borradores de versiones anteriores de este workflow. Sin esto, cada
 * guardado deja atrás una copia del config que nadie volverá a leer y que ocupa
 * espacio en localStorage (que ronda los 5 MB por dominio; un par de configs de
 * 100 KB se notan).
 */
function discardStaleDrafts(workflowId: string, currentVersion: number) {
  const keep = draftKey(workflowId, currentVersion);
  const prefix = `wf-draft:${workflowId}:`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix) && key !== keep) localStorage.removeItem(key);
  }
}

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = String(params.id);

  const { data: workflow, isLoading, error } = useAdminWorkflow(workflowId);
  const { data: editorContext } = useEditorContext();
  const { saveConfig, validateConfig } = useAdminWorkflowMutations();

  const [tab, setTab] = useState<TabId>('agents');
  /** Documento tal como vino del servidor. Nunca se muta. */
  const [original, setOriginal] = useState<WorkflowConfig | null>(null);
  /** Copia de trabajo. Cada control cambia una ruta; todo lo demás viaja intacto. */
  const [draft, setDraft] = useState<WorkflowConfig | null>(null);
  /** Versión que corresponde a `original`. Es la guarda de la recarga. */
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  /** Hash del config cargado; viaja al guardar para detectar cambios hechos por SQL. */
  const [loadedHash, setLoadedHash] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);

  // Carga inicial + recuperación de un borrador local de la misma versión.
  // La guarda es la VERSIÓN cargada, no `original`. Usar `original` provocaba que
  // tras guardar se recargara el config viejo que seguía en caché mientras el refetch
  // estaba en vuelo, dejando el editor una versión atrás y haciendo fallar el
  // siguiente guardado con un 409 sin motivo aparente.
  useEffect(() => {
    if (!workflow || loadedVersion === workflow.version) return;

    setLoadedVersion(workflow.version);
    setLoadedHash(workflow.configHash);
    setOriginal(workflow.config);
    discardStaleDrafts(workflowId, workflow.version);

    const stored = localStorage.getItem(draftKey(workflowId, workflow.version));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (!isEqualConfig(parsed, workflow.config)) {
          setDraft(parsed);
          toast.info('Se recuperó un borrador sin guardar de esta versión.');
          return;
        }
      } catch {
        localStorage.removeItem(draftKey(workflowId, workflow.version));
      }
    }
    setDraft(structuredClone(workflow.config));
  }, [workflow, loadedVersion, workflowId]);

  const isDirty = useMemo(
    () => !!original && !!draft && !isEqualConfig(original, draft),
    [original, draft],
  );

  const changes = useMemo(
    () => (original && draft ? diffLocal(original, draft) : []),
    [original, draft],
  );

  const lintIssues = useMemo(
    () => (draft ? lintConfig(draft, (workflow?.tenantTools ?? []).map((t) => t.id)) : []),
    [draft, workflow],
  );
  const lintErrors = lintIssues.filter((i) => i.severity === 'error');

  // Persistir el borrador: perder 40 minutos de escritura por cerrar una pestaña
  // sería el peor modo de falla de este editor.
  useEffect(() => {
    if (!workflow || !draft) return;
    if (loadedVersion === null) return;
    const key = draftKey(workflowId, loadedVersion);
    if (isDirty) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  }, [draft, isDirty, workflow, workflowId, loadedVersion]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleChange = useCallback((next: WorkflowConfig) => {
    setDraft(next);
    setValidation(null);
  }, []);

  const handleValidate = () => {
    if (!draft) return;
    validateConfig.mutate(
      { id: workflowId, config: draft },
      {
        onSuccess: (result) => {
          setValidation(result);
          if (result.valid) toast.success('El config es válido');
          else toast.error(`${result.errors.length} problema(s) encontrados`);
        },
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo validar'),
      },
    );
  };

  const handleSave = () => {
    if (!draft || !workflow || loadedVersion === null) return;
    saveConfig.mutate(
      {
        id: workflowId,
        input: {
          config: draft,
          expectedVersion: loadedVersion!,
          expectedHash: loadedHash ?? undefined,
          note: note.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          localStorage.removeItem(draftKey(workflowId, loadedVersion!));
          setSaveOpen(false);
          setNote('');

          // Adoptamos el borrador como nuevo original y avanzamos la versión con la
          // que respondió el servidor. Así el editor queda consistente de inmediato y
          // el refetch que ya viene en camino solo confirma lo mismo, sin recargar ni
          // parpadear "N cambios sin guardar".
          if (result.changed && result.workflow) {
            setOriginal(draft);
            setLoadedVersion(result.workflow.version);
            setLoadedHash(result.version?.configHash ?? null);
            toast.success(`Guardado como v${result.workflow.version}`);
          } else {
            toast.info('No había cambios que guardar');
          }
        },
        onError: (e: any) => {
          if (e?.toastHandled) return;
          const status = e?.response?.status ?? e?.statusCode;
          if (status === 409) {
            toast.error(
              'Alguien más guardó este workflow mientras editabas. Recarga la página para no pisar sus cambios.',
              { duration: 10000 },
            );
            return;
          }
          toast.error(e?.message ?? 'No se pudo guardar');
        },
      },
    );
  };

  if (isLoading || !draft || !workflow) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {error ? (
          <p className="text-sm text-danger">No se pudo cargar el workflow.</p>
        ) : (
          <LogoLoader text="Cargando workflow" />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <button
        onClick={() => router.push('/admin/workflows')}
        className="mb-3 inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={13} /> Workflows
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{workflow.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-text-secondary">
            <span>{workflow.organization.name}</span>
            <span>v{loadedVersion ?? workflow.version}</span>
            <span>{workflow.category}</span>
            {!workflow.isActive && <span className="text-danger">inactivo</span>}
            {workflow.isPaused && <span className="text-danger">pausado</span>}
          </p>
        </div>
        {isDirty && (
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent">
            {changes.length} cambio(s) sin guardar
          </span>
        )}
      </div>

      {lintErrors.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg border border-danger/40 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-danger">
            <AlertTriangle size={13} /> Referencias rotas ({lintErrors.length})
          </p>
          {lintErrors.slice(0, 5).map((issue, i) => (
            <p key={i} className="text-[11px] text-danger">
              · {issue.message} {issue.location && `(${issue.location})`}
            </p>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === id
                ? 'border-accent font-medium text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'agents' && (
        <AgentsTab
          config={draft}
          onChange={handleChange}
          models={editorContext?.models ?? []}
          tenantTools={workflow.tenantTools}
        />
      )}
      {tab === 'nodes' && (
        <NodesTab
          config={draft}
          onChange={handleChange}
          nodeCatalog={editorContext?.nodeCatalog ?? null}
          tenantTools={workflow.tenantTools}
        />
      )}
      {tab === 'graph' && <GraphTab config={draft} tenantTools={workflow.tenantTools} />}
      {tab === 'media' && <MediaTab config={draft} onChange={handleChange} />}
      {/* Montado bajo demanda: es la única vista que renderiza el documento completo. */}
      {tab === 'json' && (
        <RawJsonTab config={draft} onChange={handleChange} workflowName={workflow.name} />
      )}
      {tab === 'settings' && <SettingsTab workflow={workflow} />}
      {tab === 'history' && (
        <HistoryTab
          workflowId={workflowId}
          currentVersion={loadedVersion ?? workflow.version}
          hasUnsavedChanges={isDirty}
        />
      )}

      {validation && !validation.valid && (
        <div className="mt-4 space-y-1 rounded-lg border border-danger/40 p-3">
          <p className="text-xs font-medium text-danger">
            La validación del servidor encontró {validation.errors.length} problema(s):
          </p>
          {validation.errors.map((e, i) => (
            <p key={i} className="text-[11px] text-danger">
              · {e}
            </p>
          ))}
        </div>
      )}

      {/* Barra de acciones */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:pl-[264px]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
          {validation?.valid && (
            <span className="mr-auto inline-flex items-center gap-1 text-xs text-success-500">
              <CheckCircle2 size={13} /> Config válido
            </span>
          )}
          <button className={btnGhost} onClick={handleValidate} disabled={validateConfig.isPending}>
            {validateConfig.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ListChecks size={14} />
            )}
            Validar
          </button>
          <button className={btnGhost} onClick={() => setChangesOpen(true)} disabled={!isDirty}>
            Ver cambios ({changes.length})
          </button>
          <button className={btnPrimary} onClick={() => setSaveOpen(true)} disabled={!isDirty}>
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>

      <AnimatePresence>
        {changesOpen && (
          <Modal isOpen onClose={() => setChangesOpen(false)} title="Cambios sin guardar">
            {changes.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">No hay cambios.</p>
            ) : (
              <div className="space-y-3">
                {changes.map((entry, i) => (
                  <div key={i} className="rounded-lg border border-border p-2">
                    <p className="font-mono text-[11px] text-text-primary">{entry.path}</p>
                    <p className="text-[10px] uppercase text-text-secondary">{entry.op}</p>
                    {entry.op !== 'added' && (
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface-secondary p-2 font-mono text-[11px] text-text-secondary">
                        − {typeof entry.before === 'string' ? entry.before : JSON.stringify(entry.before)}
                      </pre>
                    )}
                    {entry.op !== 'removed' && (
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface-secondary p-2 font-mono text-[11px] text-text-primary">
                        + {typeof entry.after === 'string' ? entry.after : JSON.stringify(entry.after)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Modal>
        )}

        {saveOpen && (
          <Modal isOpen onClose={() => setSaveOpen(false)} title="Guardar cambios">
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Se guardarán {changes.length} cambio(s). El config anterior queda en el historial y
                puedes volver a él cuando quieras.
              </p>
              {lintErrors.length > 0 && (
                <p className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger">
                  Hay {lintErrors.length} referencia(s) rota(s). El motor fallará al ejecutar este
                  workflow aunque el guardado se acepte.
                </p>
              )}
              <div>
                <label className={labelClass}>Nota del cambio (opcional)</label>
                <input
                  className={inputClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="El cliente pidió un tono más formal"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setSaveOpen(false)}>
                  Cancelar
                </button>
                <button className={btnPrimary} onClick={handleSave} disabled={saveConfig.isPending}>
                  {saveConfig.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
