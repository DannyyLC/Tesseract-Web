import ApiRequestManager from '@/lib/api/api-request-manager';
import type { ApiResponse } from '@tesseract/types';
import type { AdminTestExecutionDetail } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';

export interface AdminConversationListItem {
  id: string;
  title: string | null;
  channel: string;
  status: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  hasError: boolean;
  authorName: string | null;
}

export interface AdminConversationsListResult {
  items: AdminConversationListItem[];
  nextCursor: string | null;
  prevCursor: string | null;
  nextPageAvailable: boolean;
  pageSize: number;
}

export interface AdminConversationMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface AdminConversationDetail {
  id: string;
  title: string | null;
  messages: AdminConversationMessage[];
  /** Mismo shape que la ejecución en vivo de Probar — se renderiza con el mismo componente. */
  executions: AdminTestExecutionDetail[];
}

export interface AdminConversationsQuery {
  organizationId: string;
  workflowId: string;
  cursor?: string;
  take?: number;
  onlyErrors?: boolean;
}

class ConversationsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/conversations';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async findAll(query: AdminConversationsQuery): Promise<AdminConversationsListResult> {
    const params = new URLSearchParams();
    params.append('organizationId', query.organizationId);
    params.append('workflowId', query.workflowId);
    if (query.cursor) params.append('cursor', query.cursor);
    if (query.take) params.append('take', String(query.take));
    if (query.onlyErrors) params.append('onlyErrors', 'true');

    const result = await this.apiRequestManager.get<ApiResponse<AdminConversationsListResult>>(
      `${ConversationsAdminApi.BASE_URL}?${params.toString()}`,
    );
    return result.data.data!;
  }

  public async findOne(
    id: string,
    organizationId: string,
    workflowId: string,
  ): Promise<AdminConversationDetail> {
    const params = new URLSearchParams({ organizationId, workflowId });
    const result = await this.apiRequestManager.get<ApiResponse<AdminConversationDetail>>(
      `${ConversationsAdminApi.BASE_URL}/${id}?${params.toString()}`,
    );
    return result.data.data!;
  }

  public async rename(id: string, organizationId: string, title: string): Promise<void> {
    await this.apiRequestManager.patch<ApiResponse<null>>(`${ConversationsAdminApi.BASE_URL}/${id}`, {
      organizationId,
      title,
    });
  }
}

export default ConversationsAdminApi;
