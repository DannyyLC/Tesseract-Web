import ApiRequestManager from '../../../api-request-manager';
import { ApiResponse } from '@tesseract/types';

export interface LlmCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Conteo de modelos asociados (incluido por el backend).
  _count?: { models: number };
}

export interface LlmCategoriesListResult {
  data: LlmCategory[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface LlmCategoriesQuery {
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateLlmCategoryInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export type UpdateLlmCategoryInput = Partial<CreateLlmCategoryInput>;

class LlmCategoriesApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/llm-categories';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async findAll(query: LlmCategoriesQuery = {}): Promise<LlmCategoriesListResult> {
    const params = new URLSearchParams();
    if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const qs = params.toString();
    const result = await this.apiRequestManager.get<ApiResponse<LlmCategoriesListResult>>(
      `${LlmCategoriesApi.BASE_URL}${qs ? `?${qs}` : ''}`,
    );
    return result.data.data!;
  }

  public async create(data: CreateLlmCategoryInput): Promise<LlmCategory> {
    const result = await this.apiRequestManager.post<ApiResponse<LlmCategory>>(
      LlmCategoriesApi.BASE_URL,
      data,
    );
    return result.data.data!;
  }

  public async update(id: string, data: UpdateLlmCategoryInput): Promise<LlmCategory> {
    const result = await this.apiRequestManager.patch<ApiResponse<LlmCategory>>(
      `${LlmCategoriesApi.BASE_URL}/${id}`,
      data,
    );
    return result.data.data!;
  }

  public async remove(id: string): Promise<LlmCategory> {
    const result = await this.apiRequestManager.delete<ApiResponse<LlmCategory>>(
      `${LlmCategoriesApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
  }
}

export default LlmCategoriesApi;
