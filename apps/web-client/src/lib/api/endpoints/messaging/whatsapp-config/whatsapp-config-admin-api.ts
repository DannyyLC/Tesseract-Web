import ApiRequestManager from '@/lib/api/api-request-manager';
import type { ApiResponse, WhatsAppConfig, WhatsAppTemplate } from '@tesseract/types';

export interface CreateWhatsappConfigAdminInput {
  phoneNumber: string;
  /** Un número nace ligado a un workflow. Reasignar/desasignar después sí es opcional. */
  workflowId: string;
  displayName?: string;
  description?: string;
}

export interface UpdateWhatsappConfigAdminInput {
  displayName?: string;
  description?: string;
  /** Tri-estado: ausente no toca, `null` desasigna, string reasigna. */
  workflowId?: string | null;
}

export interface CreateTemplateAdminInput {
  name: string;
  displayName?: string;
  language?: string;
  variables?: { body?: string[]; header?: string[]; buttons?: string[] };
}

export interface UpdateTemplateAdminInput {
  name?: string;
  displayName?: string;
  language?: string;
  variables?: { body?: string[]; header?: string[]; buttons?: string[] };
  isActive?: boolean;
}

/**
 * Canales de WhatsApp de una organización, para el super admin — tab "Canales" en
 * /admin/organizaciones/:id. La organización viaja en la URL, no en el JWT: es la
 * misma diferencia que ya existe entre organizations-api.ts y organizations-admin-api.ts.
 */
class WhatsappConfigAdminApi {
  public apiRequestManager: ApiRequestManager;

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  private base(organizationId: string): string {
    return `/admin/organizations/${organizationId}/whatsapp`;
  }

  async list(organizationId: string): Promise<WhatsAppConfig[]> {
    const result = await this.apiRequestManager.get<ApiResponse<WhatsAppConfig[]>>(
      this.base(organizationId),
    );
    return result.data.data ?? [];
  }

  async create(
    organizationId: string,
    data: CreateWhatsappConfigAdminInput,
  ): Promise<WhatsAppConfig> {
    const result = await this.apiRequestManager.post<ApiResponse<WhatsAppConfig>>(
      this.base(organizationId),
      data,
    );
    return result.data.data!;
  }

  async update(
    organizationId: string,
    configId: string,
    data: UpdateWhatsappConfigAdminInput,
  ): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${this.base(organizationId)}/${configId}`,
      data,
    );
    return result.data.data ?? false;
  }

  async remove(organizationId: string, configId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${this.base(organizationId)}/${configId}`,
    );
    return result.data.data ?? false;
  }

  async setActive(organizationId: string, configId: string, isActive: boolean): Promise<boolean> {
    const result = await this.apiRequestManager.patch<ApiResponse<boolean>>(
      `${this.base(organizationId)}/${configId}/active`,
      { isActive },
    );
    return result.data.data ?? false;
  }

  async listTemplates(organizationId: string, configId: string): Promise<WhatsAppTemplate[]> {
    const result = await this.apiRequestManager.get<ApiResponse<WhatsAppTemplate[]>>(
      `${this.base(organizationId)}/${configId}/templates`,
    );
    return result.data.data ?? [];
  }

  async createTemplate(
    organizationId: string,
    configId: string,
    data: CreateTemplateAdminInput,
  ): Promise<WhatsAppTemplate> {
    const result = await this.apiRequestManager.post<ApiResponse<WhatsAppTemplate>>(
      `${this.base(organizationId)}/${configId}/templates`,
      data,
    );
    return result.data.data!;
  }

  async updateTemplate(
    organizationId: string,
    templateId: string,
    data: UpdateTemplateAdminInput,
  ): Promise<WhatsAppTemplate> {
    const result = await this.apiRequestManager.patch<ApiResponse<WhatsAppTemplate>>(
      `${this.base(organizationId)}/templates/${templateId}`,
      data,
    );
    return result.data.data!;
  }

  async deleteTemplate(organizationId: string, templateId: string): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      `${this.base(organizationId)}/templates/${templateId}`,
    );
    return result.data.data ?? false;
  }
}

export default WhatsappConfigAdminApi;
