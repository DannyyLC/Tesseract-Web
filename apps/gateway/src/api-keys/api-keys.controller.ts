import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * Controller de API Keys
 * Maneja la creación, listado, eliminación y activación/desactivación de API Keys
 *
 * Base path: /api-keys
 * Todos los endpoints requieren autenticación JWT
 * Owner y Admin pueden gestionar API Keys
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * POST /api-keys
   * Crea un nuevo API Key para la organización
   *
   * Solo Owner y Admin pueden crear API Keys
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async create(
    @CurrentUser() user: UserPayload,
    @Body() createDto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(user.organizationId, createDto);
  }

  /**
   * GET /api-keys
   * Lista todos los API Keys de la organización
   *
   * Todos los usuarios pueden ver las API Keys
   */
  @Get()
  async findAll(@CurrentUser() user: UserPayload) {
    return this.apiKeysService.findAll(user.organizationId);
  }

  /**
   * GET /api-keys/:id
   * Obtiene detalles de un API Key específico
   */
  @Get(':id')
  async findOne(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.apiKeysService.findOne(user.organizationId, id);
  }

  /**
   * DELETE /api-keys/:id
   * Elimina un API Key (soft delete)
   *
   * Solo Owner y Admin pueden eliminar API Keys
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.apiKeysService.delete(user.organizationId, id);
  }

  /**
   * PATCH /api-keys/:id
   * Actualiza un API Key (nombre, descripción y/o estado activo)
   *
   * Solo Owner y Admin pueden actualizar API Keys
   */
  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() updateDto: UpdateApiKeyDto,
  ) {
    return this.apiKeysService.update(user.organizationId, id, updateDto);
  }
}
