import { unwrapData } from '@/lib/api/unwrap-data';
import ApiRequestManager from '../../../api-request-manager';
import {
  AdminAnnouncementDto,
  ApiResponse,
  AnnouncementStatus,
  AudiencePreviewDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UserRole,
} from '@tesseract/types';

export interface AdminAnnouncementsListResult {
  data: AdminAnnouncementDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminAnnouncementsQuery {
  status?: AnnouncementStatus;
  organizationId?: string;
  page?: number;
  limit?: number;
}

export interface AdminAnnouncementsOverview {
  status: { published: number; draft: number; expired: number; unpublished: number };
  engagement: {
    days: number;
    delivered: number;
    read: number;
    dismissed: number;
    /** Entregas de anuncios con botón: la base de la tasa de clics. */
    ctaDelivered: number;
    ctaClicked: number;
  };
}

class AnnouncementsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/announcements';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getOverview(): Promise<AdminAnnouncementsOverview> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnnouncementsOverview>>(
      `${AnnouncementsAdminApi.BASE_URL}/overview`,
    );
    return unwrapData(result);
  }

  public async list(query: AdminAnnouncementsQuery = {}): Promise<AdminAnnouncementsListResult> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.organizationId) params.append('organizationId', query.organizationId);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    const qs = params.toString();

    const result = await this.apiRequestManager.get<ApiResponse<AdminAnnouncementsListResult>>(
      `${AnnouncementsAdminApi.BASE_URL}${qs ? `?${qs}` : ''}`,
    );
    return unwrapData(result);
  }

  public async getById(id: string): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}`,
    );
    return unwrapData(result);
  }

  public async audiencePreview(
    organizationIds: string[],
    roles: UserRole[],
  ): Promise<AudiencePreviewDto> {
    const params = new URLSearchParams();
    if (organizationIds.length) params.append('organizationIds', organizationIds.join(','));
    if (roles.length) params.append('roles', roles.join(','));

    const result = await this.apiRequestManager.get<ApiResponse<AudiencePreviewDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/audience-preview?${params.toString()}`,
    );
    return unwrapData(result);
  }

  public async create(dto: CreateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminAnnouncementDto>>(
      AnnouncementsAdminApi.BASE_URL,
      dto,
    );
    return unwrapData(result);
  }

  public async update(id: string, dto: UpdateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.patch<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}`,
      dto,
    );
    return unwrapData(result);
  }

  public async publish(id: string): Promise<{ delivered: number }> {
    const result = await this.apiRequestManager.post<ApiResponse<{ delivered: number }>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}/publish`,
      {},
    );
    return unwrapData(result);
  }

  public async unpublish(id: string): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}/unpublish`,
      {},
    );
    return unwrapData(result);
  }
}

export default AnnouncementsAdminApi;
