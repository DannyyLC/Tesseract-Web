import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { OrganizationsService } from '../../organizations.service';
import { QueryOrganizationsAdminDto } from '../../dto';

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
}
