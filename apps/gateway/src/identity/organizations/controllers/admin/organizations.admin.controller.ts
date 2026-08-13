import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { OrganizationsService } from '../../organizations.service';
import {
  QueryOrganizationsAdminDto,
  UpdateCustomLimitsDto,
  UpdateOverageSettingsDto,
  DeactivateOrganizationDto,
} from '../../dto';

/**
 * Lectura de organizaciones para el super admin.
 *
 * El resto de rutas de organizaciones resuelve la organización desde el JWT, así
 * que no sirven aquí: el super admin vive en la org `platform` y necesita ver las
 * de todos los clientes para elegir sobre cuál trabajar.
 */
@ApiTags('Admin - Organizations')
@ApiBearerAuth('access-token')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class OrganizationsAdminController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar organizaciones (paginado + búsqueda)' })
  async findAll(@Query() query: QueryOrganizationsAdminDto): Promise<ApiResponse> {
    const result = await this.organizationsService.findAllForAdmin(query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una organización (info, uso y límites del plan)' })
  async findOne(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.organizationsService.findOne(id);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Patch(':id/custom-limits')
  @ApiOperation({ summary: 'Override de límites (usuarios/API keys/workflows/datasets)' })
  async updateCustomLimits(
    @Param('id') id: string,
    @Body() dto: UpdateCustomLimitsDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    const result = await this.organizationsService.updateCustomLimits(id, dto, user.email);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Patch(':id/overage')
  @ApiOperation({ summary: 'Habilitar/deshabilitar sobregiro de créditos y su límite' })
  async toggleOverage(
    @Param('id') id: string,
    @Body() dto: UpdateOverageSettingsDto,
  ): Promise<ApiResponse> {
    const result = await this.organizationsService.toggleOverages(
      id,
      dto.allowOverages,
      dto.overageLimit,
    );
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar temporalmente una organización' })
  async deactivate(
    @Param('id') id: string,
    @Body() dto: DeactivateOrganizationDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    // `deactivatedBy` viene del JWT, no del body: no confiamos en lo que mande el cliente.
    const result = await this.organizationsService.deactivate(id, user.email, dto.reason);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivar una organización previamente desactivada' })
  async reactivate(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.organizationsService.reactivate(id);
    return new ApiResponseBuilder().setData(result).build();
  }
}
