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

  public async findAll(isActive?: boolean): Promise<LlmCategory[]> {
    const qs = isActive === undefined ? '' : `?isActive=${isActive}`;
    const result = await this.apiRequestManager.get<ApiResponse<LlmCategory[]>>(
      `${LlmCategoriesApi.BASE_URL}${qs}`,
    );
    return result.data.data ?? [];
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
