import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { TenantToolService } from '../../tenant-tool.service';
import { QueryTenantToolsAdminDto } from '../../dto/query-tenant-tools-admin.dto';

/**
 * Solo lectura: ubicar a qué organización (y qué workflows) pertenece una tenant tool.
 * El resto de rutas de tools resuelve la organización desde el JWT del propio tenant,
 * así que no sirven para un super admin que necesita cruzar organizaciones — mismo
 * motivo que ya existe `OrganizationsAdminController`/`ConversationsAdminController`.
 */
@ApiTags('Admin - Tenant Tools')
@ApiBearerAuth('access-token')
@Controller('admin/tenant-tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class TenantToolAdminController {
  constructor(private readonly tenantToolService: TenantToolService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tenant tools de todas las organizaciones (búsqueda + paginado)' })
  async findAll(@Query() query: QueryTenantToolsAdminDto): Promise<ApiResponse> {
    const result = await this.tenantToolService.findAllForAdmin(query);
    return new ApiResponseBuilder().setData(result).build();
  }
}
