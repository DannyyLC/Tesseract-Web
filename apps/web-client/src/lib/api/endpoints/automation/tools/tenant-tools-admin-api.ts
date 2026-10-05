import { unwrapData } from '@/lib/api/unwrap-data';
import ApiRequestManager from '@/lib/api/api-request-manager';
import type { ApiResponse } from '@tesseract/types';

export interface AdminTenantTool {
  id: string;
  displayName: string;
  status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'EXPIRED_AUTH';
  isConnected: boolean;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  toolCatalog: {
    id: string;
    toolName: string;
    displayName: string;
    provider: string | null;
    icon: string | null;
  };
  _count: { workflows: number };
}

/** Segmentos de las tarjetas del listado (ver `admin-tenant-tool-segments.ts` del gateway). */
export type AdminTenantToolSegment = 'connected' | 'problem' | 'unattached';

export interface AdminTenantToolsOverview {
  total: number;
  connected: number;
  connectedOrganizations: number;
  problem: number;
  expiredAuth: number;
  error: number;
  unattached: number;
  catalogsInUse: number;
  mostUsed: { name: string; count: number } | null;
}

export interface AdminTenantToolsQuery {
  search?: string;
  organizationId?: string;
  segment?: AdminTenantToolSegment;
  page?: number;
  limit?: number;
}

export interface AdminTenantToolsResult {
  data: AdminTenantTool[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Solo lectura: ubicar a qué organización (y qué workflows) pertenece una tenant tool
 * a partir de su id o nombre. Ver /admin/organizaciones o el editor del workflow para
 * el resto (crear, conectar, vincular).
 */
class TenantToolsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/tenant-tools';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async findAll(query: AdminTenantToolsQuery = {}): Promise<AdminTenantToolsResult> {
    const params = new URLSearchParams();
    if (query.search) params.append('search', query.search);
    if (query.organizationId) params.append('organizationId', query.organizationId);
    if (query.segment) params.append('segment', query.segment);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const qs = params.toString();
    const result = await this.apiRequestManager.get<ApiResponse<AdminTenantToolsResult>>(
      `${TenantToolsAdminApi.BASE_URL}${qs ? `?${qs}` : ''}`,
    );
    return unwrapData(result);
  }

  public async getOverview(): Promise<AdminTenantToolsOverview> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminTenantToolsOverview>>(
      `${TenantToolsAdminApi.BASE_URL}/overview`,
    );
    return unwrapData(result);
  }
}

export default TenantToolsAdminApi;
