import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  ConversationDetailDto,
  ConversationDto,
  ConversationsStatsDto,
  DEFAULT_PAGE_SIZE,
  DashboardConversationDto,
  PaginatedResponse,
  UpdateConversationDto,
} from '@tesseract/types';

class ConversationsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/conversations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Get dashboard conversations with cursor pagination
   * Endpoint: GET /conversations/dashboard
   *
   * Recibe un objeto y no argumentos posicionales: con nueve filtros opcionales del mismo
   * tipo, la llamada era una fila de `undefined` en la que mover un filtro de sitio no
   * daba error de compilación, solo un resultado equivocado.
   */
  public async getDashboardData({
    cursor = null,
    pageSize = DEFAULT_PAGE_SIZE,
    action = null,
    status,
    isIntervened,
    workflowId,
    userId,
    prioritizeHitl = true,
    needsFollowUp,
    channels,
  }: {
    cursor?: string | null;
    pageSize?: number;
    action?: 'next' | 'prev' | null;
    status?: string;
    isIntervened?: boolean;
    workflowId?: string;
    userId?: string;
    prioritizeHitl?: boolean;
    needsFollowUp?: boolean;
    channels?: readonly string[];
  } = {}): Promise<PaginatedResponse<DashboardConversationDto>> {
    const queryParams = new URLSearchParams();
    if (cursor) queryParams.append('cursor', cursor);
    queryParams.append('pageSize', pageSize.toString());
    if (action) queryParams.append('action', action);
    if (status) queryParams.append('status', status);
    if (typeof isIntervened === 'boolean') {
      queryParams.append('isIntervened', isIntervened ? 'true' : 'false');
    }
    if (typeof needsFollowUp === 'boolean') {
      queryParams.append('needsFollowUp', needsFollowUp ? 'true' : 'false');
    }
    if (workflowId) queryParams.append('workflowId', workflowId);
    if (userId) queryParams.append('userId', userId);
    if (channels?.length) queryParams.append('channels', channels.join(','));
    queryParams.append('prioritizeHitl', prioritizeHitl ? 'true' : 'false');

    const result = await this.apiRequestManager.get<
      ApiResponse<PaginatedResponse<DashboardConversationDto>>
    >(`${ConversationsApi.BASE_URL}/dashboard?${queryParams.toString()}`);
    // Ensure we handle the potentially nested response structure correctly
    // Based on ApiResponse definition: { success: boolean, data: T | null, ... }
    return result.data.data as PaginatedResponse<DashboardConversationDto>;
  }

  /**
   * Get dashboard stats
   * Endpoint: GET /conversations/stats
   */
  public async getStats(): Promise<ConversationsStatsDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<ConversationsStatsDto>>(
      `${ConversationsApi.BASE_URL}/stats`,
    );
    return result.data.data ?? null;
  }

  /**
   * Get conversation by ID
   * Endpoint: GET /conversations/:id
   */
  public async getById(id: string): Promise<ConversationDetailDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<ConversationDetailDto>>(
      `${ConversationsApi.BASE_URL}/${id}`,
    );
    return result.data.data ?? null;
  }

  /**
   * Update conversation
   * Endpoint: PATCH /conversations/:id
   */
  public async update(id: string, dto: UpdateConversationDto): Promise<ConversationDto | null> {
    const result = await this.apiRequestManager.patch<ApiResponse<ConversationDto>>(
      `${ConversationsApi.BASE_URL}/${id}`,
      dto,
    );
    return result.data.data ?? null;
  }

  /**
   * Remove conversation
   * Endpoint: DELETE /conversations/:id
   */
  public async remove(id: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<any>>(
      `${ConversationsApi.BASE_URL}/${id}`,
    );
    return result.data.success;
  }

  /**
   * Transcribe un dictado y devuelve solo el texto.
   * Endpoint: POST /conversations/transcribe
   *
   * No lleva id de conversación: el dictado también tiene que funcionar en
   * `/conversations/new`, donde todavía no existe ninguna.
   *
   * El audio viaja como cuerpo binario, no como multipart: es un archivo suelto y el
   * servidor no lo guarda, así que no hay nada que nombrar ni campos que acompañar.
   */
  public async transcribe(audio: Blob): Promise<string> {
    const result = await this.apiRequestManager.post<ApiResponse<{ text: string }>>(
      `${ConversationsApi.BASE_URL}/transcribe`,
      audio,
      { headers: { 'Content-Type': audio.type || 'audio/webm' } },
    );
    return result.data.data?.text ?? '';
  }
}

export default ConversationsApi;
