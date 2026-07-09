import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { LlmModelsService } from '../llm-models.service';
import {
  CreateLlmModelDto,
  UpdateLlmModelDto,
  SupersedePricingDto,
  QueryLlmModelsDto,
} from '../dto';

/**
 * CRUD de modelos LLM para el super admin.
 *
 * Los modelos LLM son globales (no están scopeados por organización), por lo
 * que su administración vive en el área de super admin. Protegido por
 * JwtAuthGuard + RolesGuard, restringido a UserRole.SUPER_ADMIN.
 */
@ApiTags('Admin - LLM Models')
@ApiBearerAuth('access-token')
@Controller('admin/llm-models')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class LlmModelsAdminController {
  constructor(private readonly llmModelsService: LlmModelsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar modelos LLM (paginado + filtros)' })
  async findAll(@Query() query: QueryLlmModelsDto): Promise<ApiResponse> {
    const result = await this.llmModelsService.findAll(query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un modelo LLM por ID' })
  async findOne(@Param('id') id: string): Promise<ApiResponse> {
    const model = await this.llmModelsService.findOne(id);
    return new ApiResponseBuilder().setData(model).build();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un modelo LLM' })
  async create(@Body() dto: CreateLlmModelDto): Promise<ApiResponse> {
    const model = await this.llmModelsService.create(dto);
    return new ApiResponseBuilder().setData(model).setMessage('Modelo creado').build();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadatos de un modelo LLM (sin versionar precio)' })
  async update(@Param('id') id: string, @Body() dto: UpdateLlmModelDto): Promise<ApiResponse> {
    const model = await this.llmModelsService.update(id, dto);
    return new ApiResponseBuilder().setData(model).setMessage('Modelo actualizado').build();
  }

  @Patch(':id/pricing')
  @ApiOperation({ summary: 'Cambio de precio versionado (cierra la fila vigente, crea una nueva)' })
  async supersedePricing(
    @Param('id') id: string,
    @Body() dto: SupersedePricingDto,
  ): Promise<ApiResponse> {
    const model = await this.llmModelsService.supersedePricing(id, dto);
    return new ApiResponseBuilder().setData(model).setMessage('Precio actualizado').build();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar (soft-delete) un modelo LLM' })
  async remove(@Param('id') id: string): Promise<ApiResponse> {
    const model = await this.llmModelsService.delete(id);
    return new ApiResponseBuilder().setData(model).setMessage('Modelo desactivado').build();
  }
}
