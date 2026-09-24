/**
 * Si el canal le muestra al cliente el "visto" y el "escribiendo" mientras el bot procesa.
 *
 * Vive en `workflow.config.presenceIndicators`, igual que `mediaProcessing`: sin migración y
 * versionado con el workflow. Encendido por defecto, que es como se comportaba antes de existir.
 * Se apaga para workflows que a veces deciden NO contestar (p. ej. los que pasan un número a HITL
 * sin responderle): el acuse sale antes de correr el workflow, y prometería una respuesta que no
 * va a llegar.
 */
export function resolvePresenceIndicators(workflowConfig: unknown): boolean {
  const raw = (workflowConfig as { presenceIndicators?: unknown } | null)?.presenceIndicators;

  // Solo un booleano de verdad cambia el default: un "false" en texto o cualquier basura deja el
  // comportamiento de siempre en vez de apagar los indicadores sin que nadie lo haya pedido.
  return typeof raw === 'boolean' ? raw : true;
}
