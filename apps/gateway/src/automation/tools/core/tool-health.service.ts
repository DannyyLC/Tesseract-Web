import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { UtilityService } from '@/platform/utility/utility.service';
import { ToolConnectionStatus, UserRole } from '@tesseract/database';
import { NOTIFICATIONSENUM } from '@tesseract/types';

/** Forma mínima que necesita el cálculo de scopes. */
export interface ScopeCheckInput {
  allowedFunctions?: unknown;
  toolCatalog: {
    functions: { functionName: string; displayName?: string | null; oauthScopes: string[] }[];
  };
  credential?: { scopes?: unknown } | null;
}

export interface ScopeGap {
  missingScopes: string[];
  /** Nombres legibles de las funciones bloqueadas, para mostrarlos en la UI. */
  blockedFunctions: string[];
}

/**
 * Estado de salud de las credenciales de una TenantTool.
 *
 * Hay tres formas distintas de perder acceso a una herramienta y solo una era
 * visible antes: el refresh que falla (token revocado, contraseña cambiada, app
 * en modo testing), los scopes que el usuario no otorgó en la pantalla de
 * consentimiento, y la ausencia total de refresh token. Sin esto, las tres
 * terminaban igual: un 401 dentro de una conversación con un cliente real y un
 * badge que seguía diciendo "Conectado".
 *
 * Las transiciones se escriben con `updateMany` + guarda de estado en el WHERE
 * para que sean atómicas: varias instancias de Cloud Run pueden detectar la
 * misma falla a la vez y solo la que gana la carrera notifica.
 */
@Injectable()
export class ToolHealthService {
  private readonly logger = new Logger(ToolHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly utilityService: UtilityService,
  ) {}

  /**
   * Marca una herramienta como sin acceso y notifica **solo en el cruce**.
   *
   * Se notifica en la transición, no mientras dure la condición: si ya estaba en
   * EXPIRED_AUTH no se vuelve a avisar. Es el mismo criterio que usa
   * `credits.service.ts` para ZERO_CREDITS (avisar al cruzar el cero, no en cada
   * ejecución con saldo negativo).
   */
  async markAuthExpired(tenantToolId: string): Promise<void> {
    const { count } = await this.prisma.tenantTool.updateMany({
      where: {
        id: tenantToolId,
        status: { not: ToolConnectionStatus.EXPIRED_AUTH },
        deletedAt: null,
      },
      data: {
        status: ToolConnectionStatus.EXPIRED_AUTH,
        isConnected: false,
        connectionError: 'REFRESH_FAILED',
      },
    });

    // count === 0 => ya estaba marcada (u otra instancia ganó la carrera).
    if (count === 0) return;

    this.logger.warn(`Tool ${tenantToolId} marked EXPIRED_AUTH: refresh failed`);
    await this.notifyAuthExpired(tenantToolId);
  }

  /**
   * Marca que faltan permisos. No pisa EXPIRED_AUTH: quedarse sin token es más
   * grave que quedarse sin un scope, y el usuario solo puede arreglar una cosa
   * a la vez (reconectar resuelve ambas).
   */
  async markScopesIncomplete(tenantToolId: string, gap: ScopeGap): Promise<void> {
    const { count } = await this.prisma.tenantTool.updateMany({
      where: {
        id: tenantToolId,
        status: ToolConnectionStatus.CONNECTED,
        deletedAt: null,
      },
      data: { status: ToolConnectionStatus.ERROR, connectionError: 'MISSING_SCOPES' },
    });

    if (count === 0) return;

    this.logger.warn(
      `Tool ${tenantToolId} marked ERROR: missing scopes [${gap.missingScopes.join(', ')}] ` +
        `blocking [${gap.blockedFunctions.join(', ')}]`,
    );
  }

  /**
   * Devuelve al estado sano una herramienta que había perdido el acceso.
   *
   * Solo se recupera de EXPIRED_AUTH: un refresh exitoso prueba que la
   * autenticación funciona, pero no otorga scopes nuevos. Sacar de ERROR a una
   * tool con permisos faltantes la pintaría de verde mintiendo — esos solo se
   * arreglan reconectando, que es cuando `syncScopeHealth` los reevalúa.
   */
  async markHealthy(tenantToolId: string): Promise<void> {
    const { count } = await this.prisma.tenantTool.updateMany({
      where: {
        id: tenantToolId,
        status: ToolConnectionStatus.EXPIRED_AUTH,
        deletedAt: null,
      },
      data: {
        status: ToolConnectionStatus.CONNECTED,
        isConnected: true,
        connectionError: null,
      },
    });

    if (count === 0) return;

    this.logger.log(`Tool ${tenantToolId} recovered: back to CONNECTED`);
    // Recuperar el token puede destapar un problema de scopes que estaba
    // enmascarado por el estado más grave.
    await this.syncScopeHealth(tenantToolId);
  }

  /**
   * Compara los scopes que el usuario realmente otorgó contra los que exigen las
   * funciones habilitadas.
   *
   * Google permite desmarcar permisos individuales en la pantalla de
   * consentimiento, así que una herramienta puede quedar "conectada" y aun así
   * ser incapaz de ejecutar la mitad de sus funciones.
   */
  findScopeGap(tool: ScopeCheckInput): ScopeGap {
    const granted = new Set(
      Array.isArray(tool.credential?.scopes)
        ? (tool.credential.scopes as unknown[]).filter(
            (scope): scope is string => typeof scope === 'string',
          )
        : [],
    );

    // Sin scopes registrados no se puede concluir nada: las credenciales
    // cargadas a mano (upsert sin `scopes`) no deben reportarse como rotas.
    if (granted.size === 0) {
      return { missingScopes: [], blockedFunctions: [] };
    }

    const enabledNames = Array.isArray(tool.allowedFunctions)
      ? (tool.allowedFunctions as unknown[]).filter(
          (name): name is string => typeof name === 'string',
        )
      : tool.toolCatalog.functions.map((fn) => fn.functionName);

    const missingScopes = new Set<string>();
    const blockedFunctions: string[] = [];

    for (const fn of tool.toolCatalog.functions) {
      if (!enabledNames.includes(fn.functionName)) continue;

      const missing = (fn.oauthScopes ?? []).filter((scope) => !granted.has(scope));
      if (missing.length > 0) {
        blockedFunctions.push(fn.displayName ?? fn.functionName);
        missing.forEach((scope) => missingScopes.add(scope));
      }
    }

    return { missingScopes: [...missingScopes], blockedFunctions };
  }

  /**
   * Recalcula el estado de una herramienta recién conectada a partir de los
   * scopes otorgados. Se llama justo después del callback de OAuth, que es el
   * único momento en que sabemos con certeza qué autorizó el usuario.
   */
  async syncScopeHealth(tenantToolId: string): Promise<ScopeGap> {
    const tool = await this.prisma.tenantTool.findUnique({
      where: { id: tenantToolId },
      select: {
        allowedFunctions: true,
        credential: { select: { scopes: true } },
        toolCatalog: { select: { functions: { select: { functionName: true, oauthScopes: true } } } },
      },
    });

    if (!tool) return { missingScopes: [], blockedFunctions: [] };

    const gap = this.findScopeGap(tool);
    if (gap.blockedFunctions.length > 0) {
      await this.markScopesIncomplete(tenantToolId, gap);
    }
    return gap;
  }

  private async notifyAuthExpired(tenantToolId: string): Promise<void> {
    try {
      const tool = await this.prisma.tenantTool.findUnique({
        where: { id: tenantToolId },
        select: {
          displayName: true,
          organizationId: true,
          toolCatalog: { select: { displayName: true } },
          user: { select: { name: true, email: true } },
        },
      });

      if (!tool) return;

      // El sistema de notificaciones reparte por rol, pero quien puede reconectar
      // es quien autorizó el OAuth (o un owner). Nombrarlo evita que un admin
      // reciba un aviso sin saber a quién empujar.
      const connectedBy =
        tool.user?.name ?? tool.user?.email ?? 'un usuario que ya no esta en la organizacion';

      await this.utilityService.sendNotificationToAppClients(
        tool.organizationId,
        [UserRole.OWNER, UserRole.ADMIN],
        NOTIFICATIONSENUM.TOOL_AUTH_EXPIRED,
        [tool.displayName, tool.toolCatalog.displayName, connectedBy],
      );
    } catch (error) {
      // Nunca romper la ejecución del agente por no poder notificar.
      this.logger.error(
        `Failed to notify auth expiry for tool ${tenantToolId}: ${(error as Error).message}`,
      );
    }
  }
}
