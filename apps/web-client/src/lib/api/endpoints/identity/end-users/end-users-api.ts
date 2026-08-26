import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  BlockEndUserDto,
  CreateEndUserDto,
  DashboardEndUserDto,
  EndUsersQuery,
  EndUsersResponse,
  UpdateEndUserDto,
} from '@tesseract/types';

class EndUsersApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/end-users';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Contactos de la organización, paginados por cursor.
   *
   * El filtro por estado de bloqueo y la búsqueda van al servidor a propósito: con paginación
   * por cursor, filtrar en el cliente deja páginas de diez donde se ven dos.
   * Endpoint: GET /end-users/dashboard
   */
  public async findAll(query: EndUsersQuery = {}): Promise<EndUsersResponse> {
    const params = new URLSearchParams();
    if (query.cursor) params.append('cursor', query.cursor);
    if (query.pageSize) params.append('pageSize', query.pageSize.toString());
    if (query.action) params.append('paginationAction', query.action);
    if (query.search) params.append('search', query.search);
    if (query.blocked && query.blocked !== 'all') params.append('blocked', query.blocked);

    const response = await this.apiRequestManager.get<ApiResponse<EndUsersResponse>>(
      `${EndUsersApi.BASE_URL}/dashboard?${params.toString()}`,
    );
    return response.data.data as EndUsersResponse;
  }

  /**
   * Da de alta un contacto de WhatsApp a mano, sin esperar a que escriba primero.
   * Endpoint: POST /end-users
   */
  public async create(data: CreateEndUserDto): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.post<ApiResponse<DashboardEndUserDto>>(
      EndUsersApi.BASE_URL,
      data,
    );
    return response.data.data as DashboardEndUserDto;
  }

  /**
   * Cambia el nombre con el que se conoce al contacto. El teléfono, el email y el externalId
   * no se pueden editar desde aquí: son la identidad del contacto en su canal.
   * Endpoint: PATCH /end-users/{id}
   */
  public async update(id: string, data: UpdateEndUserDto): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.patch<ApiResponse<DashboardEndUserDto>>(
      `${EndUsersApi.BASE_URL}/${id}`,
      data,
    );
    return response.data.data as DashboardEndUserDto;
  }

  /**
   * Elimina al contacto para siempre, junto con todas sus conversaciones y mensajes.
   * Endpoint: DELETE /end-users/{id}
   */
  public async remove(id: string): Promise<void> {
    await this.apiRequestManager.delete<ApiResponse<null>>(`${EndUsersApi.BASE_URL}/${id}`);
  }

  /**
   * Bloquea un contacto: sus mensajes dejan de llegar y sus conversaciones activas se cierran.
   * Endpoint: POST /end-users/{id}/block
   */
  public async block(id: string, data: BlockEndUserDto = {}): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.post<ApiResponse<DashboardEndUserDto>>(
      `${EndUsersApi.BASE_URL}/${id}/block`,
      data,
    );
    return response.data.data as DashboardEndUserDto;
  }

  /**
   * Endpoint: POST /end-users/{id}/unblock
   */
  public async unblock(id: string): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.post<ApiResponse<DashboardEndUserDto>>(
      `${EndUsersApi.BASE_URL}/${id}/unblock`,
      {},
    );
    return response.data.data as DashboardEndUserDto;
  }
}

export default EndUsersApi;
