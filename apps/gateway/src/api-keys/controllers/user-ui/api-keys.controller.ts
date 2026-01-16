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
import { ApiKeysService } from '../../api-keys.service';
import { CreateApiKeyDto } from '../../dto/create-api-key.dto';
import { UpdateApiKeyDto } from '../../dto/update-api-key.dto';
import { ApiKeyResponseDto, ApiKeyListDto } from '../../dto/response-api-key.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/user-payload.type';

/**
 * Controller de API Keys
 * Maneja la creación, listado, eliminación y activación/desactivación de API Keys
 *
 * Base path: /api-keys
 * Todos los endpoints requieren autenticación JWT
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * POST /api-keys
   * Crea un nuevo API Key para la organización
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: UserPayload,
    @Body() createDto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.create(user.organizationId, createDto);
  }

  /**
   * GET /api-keys
   * Lista todos los API Keys de la organización
   */
  @Get()
  async findAll(@CurrentUser() user: UserPayload): Promise<ApiKeyListDto[]> {
    return this.apiKeysService.findAll(user.organizationId);
  }

  /**
   * GET /api-keys/:id
   * Obtiene detalles de un API Key específico
   */
  @Get(':id')
  async findOne(@CurrentUser() user: UserPayload, @Param('id') id: string): Promise<ApiKeyListDto> {
    return this.apiKeysService.findOne(user.organizationId, id);
  }

  /**
   * DELETE /api-keys/:id
   * Elimina un API Key (soft delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.apiKeysService.delete(user.organizationId, id);
  }

  /**
   * PATCH /api-keys/:id
   * Actualiza un API Key (nombre, descripción y/o estado activo)
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() updateDto: UpdateApiKeyDto,
  ): Promise<ApiKeyListDto> {
    return this.apiKeysService.update(user.organizationId, id, updateDto);
  }
}
