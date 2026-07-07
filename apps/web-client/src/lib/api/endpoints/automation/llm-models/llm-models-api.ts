import ApiRequestManager from '../../../api-request-manager';
import { ApiResponse } from '@tesseract/types';

export type ModelTier = 'BASIC' | 'STANDARD' | 'PREMIUM';

/** Categoría de modelo LLM (relación incluida en las lecturas de modelo). */
export interface LlmCategoryRef {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

/**
 * Modelo LLM tal como lo devuelve el gateway. Los precios son Decimal en
 * Prisma y se serializan como string en JSON.
 */
export interface LlmModel {
  id: string;
  provider: string;
  modelName: string;
  tier: ModelTier;
  llmCategoryId: string | null;
  llmCategory: LlmCategoryRef | null;
  inputPricePer1m: string;
  outputPricePer1m: string;
  contextWindow: number;
  recommendedMaxTokens: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmModelsListResult {
  data: LlmModel[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface LlmModelsQuery {
  search?: string;
  tier?: ModelTier;
  isActive?: boolean;
  llmCategoryId?: string;
  page?: number;
  limit?: number;
}

export interface CreateLlmModelInput {
  provider: string;
  modelName: string;
  tier: ModelTier;
  llmCategoryId?: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  contextWindow: number;
  recommendedMaxTokens: number;
  currency?: string;
  notes?: string;
}

// Actualización de metadatos (no versiona el precio).
export type UpdateLlmModelInput = Partial<
  Omit<CreateLlmModelInput, 'inputPricePer1m' | 'outputPricePer1m'>
> & {
  isActive?: boolean;
};

export interface SupersedePricingInput {
  inputPricePer1m: number;
  outputPricePer1m: number;
  notes?: string;
}

class LlmModelsApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/llm-models';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async findAll(query: LlmModelsQuery = {}): Promise<LlmModelsListResult> {
    const params = new URLSearchParams();
    if (query.search) params.append('search', query.search);
    if (query.tier) params.append('tier', query.tier);
    if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
    if (query.llmCategoryId) params.append('llmCategoryId', query.llmCategoryId);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const qs = params.toString();
    const url = `${LlmModelsApi.BASE_URL}${qs ? `?${qs}` : ''}`;
    const result = await this.apiRequestManager.get<ApiResponse<LlmModelsListResult>>(url);
    return result.data.data!;
  }

  public async findOne(id: string): Promise<LlmModel> {
    const result = await this.apiRequestManager.get<ApiResponse<LlmModel>>(
      `${LlmModelsApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
  }

  public async create(data: CreateLlmModelInput): Promise<LlmModel> {
    const result = await this.apiRequestManager.post<ApiResponse<LlmModel>>(
      LlmModelsApi.BASE_URL,
      data,
    );
    return result.data.data!;
  }

  public async update(id: string, data: UpdateLlmModelInput): Promise<LlmModel> {
    const result = await this.apiRequestManager.patch<ApiResponse<LlmModel>>(
      `${LlmModelsApi.BASE_URL}/${id}`,
      data,
    );
    return result.data.data!;
  }

  public async supersedePricing(id: string, data: SupersedePricingInput): Promise<LlmModel> {
    const result = await this.apiRequestManager.patch<ApiResponse<LlmModel>>(
      `${LlmModelsApi.BASE_URL}/${id}/pricing`,
      data,
    );
    return result.data.data!;
  }

  public async remove(id: string): Promise<LlmModel> {
    const result = await this.apiRequestManager.delete<ApiResponse<LlmModel>>(
      `${LlmModelsApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
  }
}

export default LlmModelsApi;
