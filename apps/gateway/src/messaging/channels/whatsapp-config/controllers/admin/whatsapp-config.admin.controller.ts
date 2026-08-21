import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  CreateConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  UpdateWhatsappConfigDto,
} from '../../dto';

/**
 * Canales de WhatsApp de una organización, para el super admin — tab "Canales" en
 * /admin/organizaciones/:id. Mismo servicio que usa el panel del cliente
 * (`WhatsappConfigService`), pero la organización viene del path, no del JWT de quien
 * llama: un super admin vive en la org "platform" y necesita administrar la de
 * cualquier cliente. Mismo patrón que `CreditsAdminController`/`SubscriptionAdminController`.
 */
@ApiTags('Admin - WhatsApp Config')
@ApiBearerAuth('access-token')
@Controller('admin/organizations/:id/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class WhatsappConfigAdminController {
  constructor(
    private readonly whatsappConfigService: WhatsappConfigService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  /** Valida que un workflowId, si viene, sea de esta misma organización. */
  private async assertWorkflowBelongsToOrg(organizationId: string, workflowId?: string | null) {
    if (!workflowId) return;
    const workflow = await this.workflowsService.getRoutingState(organizationId, workflowId);
    if (!workflow) {
      throw new BadRequestException('Workflow not found in this organization');
    }
  }

  /** Ownership: `configId` llega en la URL, hay que confirmar que es de esta organización. */
  private async getOwnedConfigOrThrow(organizationId: string, configId: string) {
    const config = await this.whatsappConfigService.getWhatsappConfigById(configId);
    if (!config || config.organizationId !== organizationId) {
      throw new NotFoundException('WhatsApp config not found in this organization');
    }
    return config;
  }

  @Get()
  @ApiOperation({ summary: 'Listar los números de WhatsApp de la organización' })
  async list(@Param('id') organizationId: string): Promise<ApiResponse> {
    const records = await this.whatsappConfigService.getConfigsByOrganization(organizationId);
    return new ApiResponseBuilder().setData(records).build();
  }

  @Post()
  @ApiOperation({ summary: 'Dar de alta un número — el workflow es opcional' })
  async create(
    @Param('id') organizationId: string,
    @Body() dto: CreateConfigDto,
  ): Promise<ApiResponse> {
    const existing = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(dto.phoneNumber);
    if (existing) {
      throw new BadRequestException('A WhatsApp config with this phone number already exists');
    }

    await this.assertWorkflowBelongsToOrg(organizationId, dto.workflowId);

    const record = await this.whatsappConfigService.createRecordAndgenerateWebhookSecret(
      organizationId,
      dto.workflowId,
      dto.phoneNumber,
      { displayName: dto.displayName, description: dto.description },
    );
    if (!record) {
      throw new BadRequestException('Failed to create WhatsApp config');
    }
    return new ApiResponseBuilder().setData(record).build();
  }

  @Patch(':configId')
  @ApiOperation({ summary: 'Editar nombre/descripción o reasignar el workflow por defecto' })
  async update(
    @Param('id') organizationId: string,
    @Param('configId') configId: string,
    @Body() dto: UpdateWhatsappConfigDto,
  ): Promise<ApiResponse> {
    await this.getOwnedConfigOrThrow(organizationId, configId);
    if (dto.workflowId) {
      await this.assertWorkflowBelongsToOrg(organizationId, dto.workflowId);
    }

    const success = await this.whatsappConfigService.updateConfig(configId, dto);
    return new ApiResponseBuilder().setData(success).build();
  }

  @Delete(':configId')
  @ApiOperation({ summary: 'Eliminar un número (borra también sus templates, en cascada)' })
  async remove(
    @Param('id') organizationId: string,
    @Param('configId') configId: string,
  ): Promise<ApiResponse> {
    await this.getOwnedConfigOrThrow(organizationId, configId);
    const success = await this.whatsappConfigService.deleteRecord(configId);
    return new ApiResponseBuilder().setData(success).build();
  }

  @Patch(':configId/active')
  @ApiOperation({ summary: 'Activar/desactivar un número' })
  async setActive(
    @Param('id') organizationId: string,
    @Param('configId') configId: string,
    @Body('isActive') isActive: boolean,
  ): Promise<ApiResponse> {
    await this.getOwnedConfigOrThrow(organizationId, configId);
    const success = await this.whatsappConfigService.updateIsActive(configId, isActive);
    return new ApiResponseBuilder().setData(success).build();
  }

  // ─── Templates ────────────────────────────────────────────────────────

  @Get(':configId/templates')
  @ApiOperation({ summary: 'Listar templates de un número' })
  async listTemplates(
    @Param('id') organizationId: string,
    @Param('configId') configId: string,
  ): Promise<ApiResponse> {
    await this.getOwnedConfigOrThrow(organizationId, configId);
    const templates = await this.whatsappConfigService.listTemplates(configId);
    return new ApiResponseBuilder().setData(templates).build();
  }

  @Post(':configId/templates')
  @ApiOperation({ summary: 'Crear un template en un número' })
  async createTemplate(
    @Param('id') organizationId: string,
    @Param('configId') configId: string,
    @Body() dto: CreateTemplateDto,
  ): Promise<ApiResponse> {
    await this.getOwnedConfigOrThrow(organizationId, configId);
    const template = await this.whatsappConfigService.createTemplate(configId, dto);
    return new ApiResponseBuilder().setData(template).build();
  }

  @Patch('templates/:templateId')
  @ApiOperation({ summary: 'Editar un template' })
  async updateTemplate(
    @Param('id') organizationId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ApiResponse> {
    await this.assertTemplateBelongsToOrg(organizationId, templateId);
    const template = await this.whatsappConfigService.updateTemplate(templateId, dto);
    return new ApiResponseBuilder().setData(template).build();
  }

  @Delete('templates/:templateId')
  @ApiOperation({ summary: 'Borrar un template' })
  async deleteTemplate(
    @Param('id') organizationId: string,
    @Param('templateId') templateId: string,
  ): Promise<ApiResponse> {
    await this.assertTemplateBelongsToOrg(organizationId, templateId);
    const success = await this.whatsappConfigService.deleteTemplate(templateId);
    return new ApiResponseBuilder().setData(success).build();
  }

  private async assertTemplateBelongsToOrg(organizationId: string, templateId: string) {
    const template = await this.whatsappConfigService.getTemplate(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    await this.getOwnedConfigOrThrow(organizationId, template.whatsAppConfigId);
  }
}
