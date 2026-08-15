/**
 * Ruta del worker interno de test-execute asíncrono, protegido por
 * `CloudTasksOidcGuard`. Se declara aparte para no repetir el string entre el
 * `enqueue()` (WorkflowsExecutionAdminController) y el `@Controller`/`@Post` del worker
 * (WorkflowsTestWorkerController) — mismo patrón que `WHATSAPP_WORKER_PATH`.
 */
export const WORKFLOWS_TEST_WORKER_PATH = '/api/admin/workflows/internal/test-execute';
