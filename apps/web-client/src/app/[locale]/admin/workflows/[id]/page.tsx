'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import {
  Bot,
  Boxes,
  CheckCircle2,
  FileJson,
  FlaskConical,
  GitBranch,
  History,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Save,
  SlidersHorizontal,
  AlertTriangle,
  Undo2,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
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
import { TestTab } from '@/components/admin/workflows/test-tab';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { btnGhost, btnPrimary, inputClass, labelClass } from '../../_styles';

type TabId = 'agents' | 'nodes' | 'graph' | 'media' | 'json' | 'test' | 'settings' | 'history';

/** Pestañas que no tocan `draft` (ver `showConfigFooter` más abajo). */
const NON_DRAFT_TABS: TabId[] = ['settings', 'history', 'test'];

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

/**
 * `useSearchParams` obliga a Next a tener un límite de Suspense para poder
 * prerenderizar; sin él, el build falla al exportar la ruta.
 */
export default function WorkflowEditorPage() {
  const t = useTranslations('Admin.WorkflowEditor');
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <LogoLoader text={t('loading')} />
        </div>
      }
    >
      <WorkflowEditor />
    </Suspense>
  );
}

function WorkflowEditor() {
  const t = useTranslations('Admin.WorkflowEditor');
  const getApiErrorMessage = useApiErrorMessage();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const workflowId = String(params.id);

  const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
    { id: 'agents', label: t('tabs.agents'), icon: Bot },
    { id: 'nodes', label: t('tabs.nodes'), icon: Boxes },
    { id: 'graph', label: t('tabs.graph'), icon: GitBranch },
    { id: 'media', label: t('tabs.media'), icon: ImageIcon },
    { id: 'json', label: t('tabs.json'), icon: FileJson },
    { id: 'test', label: t('tabs.test'), icon: FlaskConical },
    { id: 'settings', label: t('tabs.settings'), icon: SlidersHorizontal },
    { id: 'history', label: t('tabs.history'), icon: History },
  ];

  const { data: workflow, isLoading, error } = useAdminWorkflow(workflowId);
  const { data: editorContext } = useEditorContext();
  const { saveConfig, validateConfig } = useAdminWorkflowMutations();

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
  const [discardOpen, setDiscardOpen] = useState(false);
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);

  /*
   * La pestaña activa vive en la URL (?tab=…) y no en estado local: así sobrevive a
   * un refresh, se puede compartir el enlace a una pestaña concreta y los botones de
   * atrás/adelante del navegador funcionan como se espera.
   */
  const tabParam = searchParams.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'agents';

  const setTab = useCallback(
    (next: TabId) => {
      const query = new URLSearchParams(searchParams.toString());
      query.set('tab', next);
      // `replace` y no `push`: cambiar de pestaña no debería llenar el historial de
      // entradas que el usuario tendría que deshacer una por una.
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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
          toast.info(t('draftRecovered'));
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

  // Ajustes, Historial y Probar no tocan `draft`: Ajustes guarda metadata por su cuenta
  // con su propio botón, Historial no edita nada y Probar solo ejecuta (no cambia el
  // config). Mostrar aquí Validar/Guardar/Ver cambios sin motivo confundía. Pero si hay
  // cambios de config pendientes de OTRA pestaña, hay que poder guardarlos o
  // descartarlos desde donde sea — así que la barra aparece igual, en el mismo lugar de
  // siempre, en cuanto hay algo pendiente.
  const showConfigFooter = isDirty || !NON_DRAFT_TABS.includes(tab);

  const changes = useMemo(
    () => (original && draft ? diffLocal(original, draft) : []),
    [original, draft],
  );

  const tLint = useTranslations('Admin.LintConfig');
  const lintIssues = useMemo(
    () =>
      draft ? lintConfig(draft, (workflow?.tenantTools ?? []).map((tool) => tool.id), tLint) : [],
    [draft, workflow, tLint],
  );
  const lintErrors = lintIssues.filter((i) => i.severity === 'error');

  // Persistir el borrador: perder 40 minutos de escritura por cerrar una pestaña
  // sería el peor modo de falla de este editor. Esto ya cubre el caso que antes
  // atajaba un `beforeunload` nativo (recargar/cerrar con cambios sin guardar): al
  // volver, el borrador se recupera solo desde acá arriba (ver el `useEffect` de
  // carga inicial). El diálogo nativo del navegador no se puede reemplazar por un
  // modal propio — ninguno lo permite desde ~2016 — así que en vez de pelear con
  // eso, se quitó: ya no hace falta, no hay nada que se pierda de verdad.
  useEffect(() => {
    if (!workflow || !draft) return;
    if (loadedVersion === null) return;
    const key = draftKey(workflowId, loadedVersion);
    if (isDirty) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  }, [draft, isDirty, workflow, workflowId, loadedVersion]);

  const handleChange = useCallback((next: WorkflowConfig) => {
    setDraft(next);
    setValidation(null);
  }, []);

  /** Vuelve `draft` a como está guardado. Es la única forma de cancelar ediciones. */
  const handleDiscard = () => {
    if (!original || loadedVersion === null) return;
    setDraft(structuredClone(original));
    setValidation(null);
    localStorage.removeItem(draftKey(workflowId, loadedVersion));
    setDiscardOpen(false);
    toast.info(t('changesDiscarded'));
  };

  const handleValidate = () => {
    if (!draft) return;
    validateConfig.mutate(
      { id: workflowId, config: draft },
      {
        onSuccess: (result) => {
          setValidation(result);
          if (result.valid) toast.success(t('configValid'));
          else toast.error(t('validationIssues', { count: result.errors.length }));
        },
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
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
            toast.success(t('savedAsVersion', { version: result.workflow.version }));
          } else {
            toast.info(t('nothingToSave'));
          }
        },
        onError: (e: any) => {
          if (e?.toastHandled) return;
          const status = e?.response?.status ?? e?.statusCode;
          if (status === 409) {
            toast.error(t('conflictError'), { duration: 10000 });
            return;
          }
          toast.error(getApiErrorMessage(e));
        },
      },
    );
  };

  if (isLoading || !draft || !workflow) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {error ? (
          <p className="text-sm text-danger">{t('loadError')}</p>
        ) : (
          <LogoLoader text={t('loading')} />
        )}
      </div>
    );
  }

  return (
    <div className={`w-full ${showConfigFooter ? 'pb-24' : ''}`}>
      {/*
        Barra propia del editor, pegada al borde del área de contenido: se sangra el
        padding del layout con márgenes negativos y queda fija al hacer scroll, para
        que las pestañas sigan a mano en un documento largo. En móvil arranca bajo el
        header del layout (h-14); en escritorio no hay header, así que va a top-0.
      */}
      <div className="sticky top-14 z-20 -mx-4 -mt-4 mb-4 border-b border-border bg-surface/95 backdrop-blur md:-mx-6 md:-mt-6 lg:top-0 lg:-mx-8 lg:-mt-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3 md:px-6 lg:px-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-base font-semibold text-text-primary">{workflow.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-text-secondary">
              <span>{workflow.organization.name}</span>
              <span>v{loadedVersion ?? workflow.version}</span>
              <span>{workflow.category}</span>
              {!workflow.isActive && <span className="text-danger">{t('inactiveBadge')}</span>}
              {workflow.isPaused && <span className="text-danger">{t('pausedBadge')}</span>}
              {workflow.deletedAt && (
                <span className="font-medium text-danger">
                  {t('deletedOn', { date: new Date(workflow.deletedAt).toLocaleDateString() })}
                </span>
              )}
            </p>
          </div>
          {/* Solo informativo — las acciones (Guardar/Descartar/Validar/Ver cambios)
              viven todas juntas abajo, en la barra sticky. Un solo lugar. */}
          {isDirty && (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent">
              {t('unsavedChanges', { count: changes.length })}
            </span>
          )}
        </div>

        <nav className="flex flex-wrap gap-1 px-4 md:px-6 lg:px-8">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                tab === id
                  ? 'border-accent font-medium text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {lintErrors.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg border border-danger/40 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-danger">
            <AlertTriangle size={13} /> {t('brokenReferences', { count: lintErrors.length })}
          </p>
          {lintErrors.slice(0, 5).map((issue, i) => (
            <p key={i} className="text-[11px] text-danger">
              · {issue.message} {issue.location && `(${issue.location})`}
            </p>
          ))}
        </div>
      )}

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
      {tab === 'test' && <TestTab workflow={workflow} />}
      {tab === 'settings' && <SettingsTab workflow={workflow} />}
      {tab === 'history' && (
        <HistoryTab
          workflowId={workflowId}
          currentVersion={loadedVersion ?? workflow.version}
          hasUnsavedChanges={isDirty}
        />
      )}

      {showConfigFooter && validation && !validation.valid && (
        <div className="mt-4 space-y-1 rounded-lg border border-danger/40 p-3">
          <p className="text-xs font-medium text-danger">
            {t('serverValidationIssues', { count: validation.errors.length })}
          </p>
          {validation.errors.map((e, i) => (
            <p key={i} className="text-[11px] text-danger">
              · {e}
            </p>
          ))}
        </div>
      )}

      {/*
        `fixed` de verdad, no `sticky`: con `sticky` el navegador la "suelta" al llegar
        al final del documento y se reacomoda a su posición en el flujo — eso es el
        salto que se veía al hacer scroll hasta abajo. `fixed` la deja anclada a la
        ventana sin importar el scroll, punto.
        Antes evitábamos `fixed` porque habría que hardcodear el ancho del sidebar para
        no quedar tapada por él (y se desalineaba al colapsarlo). Eso ya no hace falta:
        `--admin-sidebar-w` la pone `layout.tsx` como variable CSS y se actualiza sola
        con el sidebar.
        Oculta en Ajustes/Historial: ninguna de las dos toca `draft`, así que estos
        botones (que son del config) no tienen nada que ver con lo que se ve ahí y
        solo confundían.
      */}
      {showConfigFooter && (
        <div className="fixed inset-x-0 bottom-0 z-20 h-16 border-t border-border bg-surface/95 px-4 backdrop-blur transition-[left] duration-300 md:px-6 lg:left-[var(--admin-sidebar-w)] lg:px-8">
          {/*
            `flex-nowrap` + `overflow-x-auto` y no `flex-wrap`: con varios botones, en
            cuanto el ancho disponible bajaba un poco (aparece la scrollbar, se achica la
            ventana) la fila pasaba a dos líneas y la barra crecía de alto. Con altura fija
            (`h-16`) y una sola línea que scrollea horizontal si hace falta, nunca cambia
            de tamaño.
          */}
          <div className="flex h-full flex-nowrap items-center justify-end gap-2 overflow-x-auto">
            {validation?.valid && (
              <span className="mr-auto inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-success-500">
                <CheckCircle2 size={13} /> {t('configValid')}
              </span>
            )}
            <button
              className={`${btnGhost} shrink-0 whitespace-nowrap`}
              onClick={handleValidate}
              disabled={validateConfig.isPending}
            >
              {validateConfig.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ListChecks size={14} />
              )}
              {t('validate')}
            </button>
            <button
              className={`${btnGhost} shrink-0 whitespace-nowrap`}
              onClick={() => setChangesOpen(true)}
              disabled={!isDirty}
            >
              {t('viewChanges', { count: changes.length })}
            </button>
            <button
              className={`${btnGhost} shrink-0 whitespace-nowrap text-danger hover:bg-danger/10`}
              onClick={() => setDiscardOpen(true)}
              disabled={!isDirty}
            >
              <Undo2 size={14} /> {t('discard')}
            </button>
            <button
              className={`${btnPrimary} shrink-0 whitespace-nowrap`}
              onClick={() => setSaveOpen(true)}
              disabled={!isDirty}
            >
              <Save size={14} /> {t('save')}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {changesOpen && (
          <Modal isOpen onClose={() => setChangesOpen(false)} title={t('unsavedChangesModalTitle')}>
            {changes.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">{t('noChanges')}</p>
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
          <Modal isOpen onClose={() => setSaveOpen(false)} title={t('saveChangesModalTitle')}>
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t('saveChangesHint', { count: changes.length })}
              </p>
              {lintErrors.length > 0 && (
                <p className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger">
                  {t('brokenReferencesWarning', { count: lintErrors.length })}
                </p>
              )}
              <div>
                <label className={labelClass}>{t('noteLabel')}</label>
                <input
                  className={inputClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('notePlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setSaveOpen(false)}>
                  {t('cancel')}
                </button>
                <button className={btnPrimary} onClick={handleSave} disabled={saveConfig.isPending}>
                  {saveConfig.isPending ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={handleDiscard}
        variant="danger"
        title={t('discardModalTitle')}
        message={t('discardModalMessage', { count: changes.length })}
        confirmLabel={t('discard')}
      />
    </div>
  );
}
