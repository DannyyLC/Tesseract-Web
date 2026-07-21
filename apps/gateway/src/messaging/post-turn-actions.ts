/**
 * Acciones post-turno declarativas.
 *
 * Un workflow declara en su config (junto a `graph`/`agents`) acciones que el
 * Gateway ejecuta al terminar cada turno, evaluadas contra las variables
 * persistidas de la conversación:
 *
 *   "post_turn_actions": [{
 *     "id": "share_catalog_media",
 *     "when": { "variable": "media_url", "op": "not_empty" },
 *     "action": "send_drive_folder_media",
 *     "params": { "intro_message": "Te comparto unos archivos..." },
 *     "once_per_conversation": true
 *   }]
 *
 * Este módulo es PURO (sin Nest/Prisma): evalúa condiciones y orquesta los
 * handlers que le pasa el canal. Los handlers concretos (enviar media, enviar
 * texto) viven en el servicio del canal correspondiente.
 */

export interface PostTurnActionWhen {
  variable: string;
  op?: 'not_empty' | 'eq' | 'neq';
  value?: unknown;
}

export interface PostTurnAction {
  id: string;
  when: PostTurnActionWhen;
  action: string;
  params?: Record<string, unknown>;
  once_per_conversation?: boolean;
}

/** Handler de una acción: recibe el valor de la variable disparadora y los params declarados. */
export type PostTurnActionHandler = (
  triggerValue: unknown,
  params: Record<string, unknown>,
) => Promise<void>;

export interface RunPostTurnActionsInput {
  actions: PostTurnAction[];
  /** Variables persistidas de la conversación (conversation.metadata.variables). */
  variables: Record<string, unknown>;
  /** Flags de acciones ya ejecutadas en esta conversación ({actionId: true}). */
  doneFlags: Record<string, boolean>;
  /** Handlers disponibles del canal ({action_name: handler}). */
  handlers: Record<string, PostTurnActionHandler>;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export function evaluateWhen(
  when: PostTurnActionWhen | undefined,
  variables: Record<string, unknown>,
): boolean {
  if (!when?.variable) return false;
  const value = variables[when.variable];
  const op = when.op ?? 'not_empty';

  switch (op) {
    case 'not_empty':
      return value !== undefined && value !== null && String(value).trim() !== '';
    case 'eq':
      return value === when.value;
    case 'neq':
      return value !== when.value;
    default:
      return false;
  }
}

/**
 * Ejecuta las acciones declaradas cuya condición matchea. Devuelve los flags de
 * "ya ejecutada" actualizados para persistir en la conversación. Los errores de
 * un handler no bloquean las demás acciones (y NO marcan el flag: se reintenta
 * en el siguiente turno).
 */
export async function runPostTurnActions(
  input: RunPostTurnActionsInput,
): Promise<Record<string, boolean>> {
  const { actions, variables, handlers } = input;
  const log = input.log ?? (() => undefined);
  const doneFlags = { ...input.doneFlags };

  for (const action of actions ?? []) {
    if (!action?.id || !action?.action) {
      log('warn', `post_turn_actions: acción sin 'id' o 'action' — ignorada`);
      continue;
    }

    if (action.once_per_conversation && doneFlags[action.id]) {
      continue;
    }

    if (!evaluateWhen(action.when, variables)) {
      continue;
    }

    const handler = handlers[action.action];
    if (!handler) {
      log(
        'warn',
        `post_turn_actions: acción '${action.action}' (${action.id}) no soportada por este canal. ` +
          `Disponibles: ${Object.keys(handlers).join(', ')}`,
      );
      continue;
    }

    try {
      log('info', `post_turn_actions: ejecutando '${action.id}' (${action.action})`);
      await handler(variables[action.when.variable], action.params ?? {});
      if (action.once_per_conversation) {
        doneFlags[action.id] = true;
      }
    } catch (error) {
      log(
        'error',
        `post_turn_actions: error en '${action.id}': ${(error as Error).message}`,
      );
    }
  }

  return doneFlags;
}
