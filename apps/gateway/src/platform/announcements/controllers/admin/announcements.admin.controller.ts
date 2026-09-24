import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { AnnouncementsService } from '../../announcements.service';
import {
  AudiencePreviewQueryDto,
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from '../../dto';

/**
 * Anuncios masivos del super admin: crear, listar, publicar (fan-out), despublicar y medir.
 * Sigue el mismo encabezado que `CreditsAdminController` — el otro controlador super-admin-only
 * del repo.
 */
@ApiTags('Admin - Announcements')
@ApiBearerAuth('access-token')
@Controller('admin/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AnnouncementsAdminController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar anuncios con métricas' })
  async list(@Query() query: ListAnnouncementsQueryDto): Promise<ApiResponse> {
    const result = await this.announcementsService.list(query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get('audience-preview')
  @ApiOperation({ summary: 'Conteo estimado de destinatarios antes de publicar' })
  async audiencePreview(@Query() query: AudiencePreviewQueryDto): Promise<ApiResponse> {
    const roles = (query.roles?.split(',').map((r) => r.trim().toUpperCase()) ?? []) as UserRole[];
    const organizationIds =
      query.organizationIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
    const result = await this.announcementsService.audiencePreview(organizationIds, roles);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un anuncio con sus métricas' })
  async getById(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.announcementsService.getById(id);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un anuncio (borrador o publicación inmediata)' })
  async create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const result = await this.announcementsService.create(dto, user);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un anuncio (contenido solo si no se ha enviado)' })
  async update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto): Promise<ApiResponse> {
    const result = await this.announcementsService.update(id, dto);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publicar y enviar (fan-out) un anuncio' })
  async publish(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.announcementsService.publish(id);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: 'Despublicar: apaga el modal y lo retira de la campana' })
  async unpublish(@Param('id') id: string): Promise<ApiResponse> {
    await this.announcementsService.unpublish(id);
    const result = await this.announcementsService.getById(id);
    return new ApiResponseBuilder().setData(result).build();
  }
}
