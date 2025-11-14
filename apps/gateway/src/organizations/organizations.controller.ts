import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * Controlador de gestión de organizaciones
 * 
 * Endpoints protegidos por JWT
 * Solo el owner puede modificar la organización
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  private readonly logger = new Logger(OrganizationsController.name);

  constructor(private readonly organizationsService: OrganizationsService) {}

  /**
   * Obtiene la información de la organización del usuario autenticado
   * 
   * GET /organizations/me
   * 
   * Cualquier usuario autenticado puede ver su organización
   */
  @Get('me')
  async getMyOrganization(@CurrentUser() user: UserPayload) {
    return this.organizationsService.findOne(user.organizationId);
  }

  /**
   * Actualiza la información de la organización
   * 
   * PUT /organizations/me
   * 
   * Solo el owner puede actualizar
   */
  @Put('me')
  @Roles(UserRole.OWNER)
  async updateMyOrganization(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(user.organizationId, dto);
  }

  /**
   * Obtiene las estadísticas de uso de la organización
   * 
   * GET /organizations/me/stats
   * 
   * Muestra uso de usuarios, workflows, API keys y ejecuciones
   */
  @Get('me/stats')
  async getMyStats(@CurrentUser() user: UserPayload) {
    return this.organizationsService.getStats(user.organizationId);
  }

  /**
   * Lista todos los miembros de la organización
   * 
   * GET /organizations/me/members
   * 
   * Owner y Admin pueden ver los miembros
   */
  @Get('me/members')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getMembers(@CurrentUser() user: UserPayload) {
    return this.organizationsService.listMembers(user.organizationId);
  }
}
