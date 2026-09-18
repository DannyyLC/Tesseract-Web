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

class AnnouncementsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/announcements';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
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
    return result.data.data!;
  }

  public async getById(id: string): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
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
    return result.data.data!;
  }

  public async create(dto: CreateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminAnnouncementDto>>(
      AnnouncementsAdminApi.BASE_URL,
      dto,
    );
    return result.data.data!;
  }

  public async update(id: string, dto: UpdateAnnouncementDto): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.patch<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}`,
      dto,
    );
    return result.data.data!;
  }

  public async publish(id: string): Promise<{ delivered: number }> {
    const result = await this.apiRequestManager.post<ApiResponse<{ delivered: number }>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}/publish`,
      {},
    );
    return result.data.data!;
  }

  public async unpublish(id: string): Promise<AdminAnnouncementDto> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminAnnouncementDto>>(
      `${AnnouncementsAdminApi.BASE_URL}/${id}/unpublish`,
      {},
    );
    return result.data.data!;
  }
}

export default AnnouncementsAdminApi;
