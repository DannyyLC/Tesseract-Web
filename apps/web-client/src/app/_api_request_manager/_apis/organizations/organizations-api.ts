import ApiRequestManager from '../../api_request_manager';
import { ApiResponse } from '../../api_response.model';
import {
  DashboardOrganizationDto,
  UpdateOrganizationDto,
  InviteUserDto,
  AcceptInvitationDto,
} from '@/app/_model/organizations.dto';
import { Organization, User } from '@/app/_model/models.model';

class OrganizationsApi {
  private requestManager: ApiRequestManager;

  constructor() {
    this.requestManager = ApiRequestManager.getInstance();
  }

  /**
   * Obtener Datos del Dashboard
   * GET /organizations/dashboard
   */
  async getDashboardData(): Promise<DashboardOrganizationDto> {
    const response = await this.requestManager.get<
      ApiResponse<DashboardOrganizationDto>
    >('/organizations/dashboard');
    return response.data.data as DashboardOrganizationDto;
  }

  /**
   * Actualizar Organización
   * PATCH /organizations/update
   */
  async update(data: UpdateOrganizationDto): Promise<Organization> {
    const response = await this.requestManager.patch<ApiResponse<Organization>>(
      '/organizations/update',
      data
    );
    return response.data.data as Organization;
  }

  /**
   * Invitar Usuario
   * POST /organizations/invite-user
   */
  async inviteUser(data: InviteUserDto): Promise<boolean> {
    const response = await this.requestManager.post<ApiResponse<boolean>>(
      '/organizations/invite-user',
      data
    );
    return response.data.data as boolean;
  }

  /**
   * Aceptar Invitación
   * POST /organizations/accept-invitation
   */
  async acceptInvitation(data: AcceptInvitationDto): Promise<User> {
    const response = await this.requestManager.post<ApiResponse<User>>(
      '/organizations/accept-invitation',
      data
    );
    return response.data.data as User;
  }

  /**
   * Eliminar Organización
   * DELETE /organizations/delete
   */
  async delete(data: {
    confirmationText: string;
    code2FA?: string;
  }): Promise<Organization> {
    const response = await this.requestManager.delete<ApiResponse<Organization>>(
      '/organizations/delete',
      { data }
    );
    return response.data.data as Organization;
  }
}

export default OrganizationsApi;
