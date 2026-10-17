import { Prisma } from '@tesseract/database';

/**
 * Segmentos de las tarjetas del listado de integraciones del super admin. Los usan el conteo de
 * las tarjetas y el filtro del listado, para que el número coincida con lo que se lista.
 */
export const ADMIN_TENANT_TOOL_SEGMENTS = ['connected', 'problem', 'unattached'] as const;
export type AdminTenantToolSegment = (typeof ADMIN_TENANT_TOOL_SEGMENTS)[number];

/** Integración viva de una organización viva. */
export const LIVE_TENANT_TOOL_WHERE: Prisma.TenantToolWhereInput = {
  deletedAt: null,
  organization: { deletedAt: null },
};

export function tenantToolSegmentWhere(
  segment: AdminTenantToolSegment,
): Prisma.TenantToolWhereInput {
  switch (segment) {
    case 'connected':
      return { ...LIVE_TENANT_TOOL_WHERE, status: 'CONNECTED' };
    case 'problem':
      return { ...LIVE_TENANT_TOOL_WHERE, status: { in: ['ERROR', 'EXPIRED_AUTH'] } };
    // Conectada (y tal vez cobrando cuota del proveedor) pero ningún workflow vivo la usa.
    // `lastUsedAt` no sirve para esto: hoy nada lo actualiza.
    case 'unattached':
      return {
        ...LIVE_TENANT_TOOL_WHERE,
        status: 'CONNECTED',
        workflows: { none: { deletedAt: null } },
      };
  }
}
