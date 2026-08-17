import ApiRequestManager from '../../../api-request-manager';
import {
  BlockEndUserDto,
  DashboardEndUserDto,
  EndUsersQuery,
  EndUsersResponse,
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

    const response = await this.apiRequestManager.get<EndUsersResponse>(
      `${EndUsersApi.BASE_URL}/dashboard?${params.toString()}`,
    );
    return response.data;
  }

  /**
   * Bloquea un contacto: sus mensajes dejan de llegar y sus conversaciones activas se cierran.
   * Endpoint: POST /end-users/{id}/block
   */
  public async block(id: string, data: BlockEndUserDto = {}): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.post<DashboardEndUserDto>(
      `${EndUsersApi.BASE_URL}/${id}/block`,
      data,
    );
    return response.data;
  }

  /**
   * Endpoint: POST /end-users/{id}/unblock
   */
  public async unblock(id: string): Promise<DashboardEndUserDto> {
    const response = await this.apiRequestManager.post<DashboardEndUserDto>(
      `${EndUsersApi.BASE_URL}/${id}/unblock`,
      {},
    );
    return response.data;
  }
}

export default EndUsersApi;
