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
import { LlmCategoriesService } from '../llm-categories.service';
import { CreateLlmCategoryDto, UpdateLlmCategoryDto } from '../dto';

/**
 * CRUD de categorías de modelos LLM para el super admin.
 * Categorías globales (no scopeadas por organización).
 */
@ApiTags('Admin - LLM Categories')
@ApiBearerAuth('access-token')
@Controller('admin/llm-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class LlmCategoriesAdminController {
  constructor(private readonly categoriesService: LlmCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías de modelos LLM' })
  async findAll(@Query('isActive') isActive?: string): Promise<ApiResponse> {
    const filter = isActive === undefined ? undefined : isActive === 'true';
    const data = await this.categoriesService.findAll(filter);
    return new ApiResponseBuilder().setData(data).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría por ID' })
  async findOne(@Param('id') id: string): Promise<ApiResponse> {
    const data = await this.categoriesService.findOne(id);
    return new ApiResponseBuilder().setData(data).build();
  }

  @Post()
  @ApiOperation({ summary: 'Crear una categoría' })
  async create(@Body() dto: CreateLlmCategoryDto): Promise<ApiResponse> {
    const data = await this.categoriesService.create(dto);
    return new ApiResponseBuilder().setData(data).setMessage('Categoría creada').build();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una categoría' })
  async update(@Param('id') id: string, @Body() dto: UpdateLlmCategoryDto): Promise<ApiResponse> {
    const data = await this.categoriesService.update(id, dto);
    return new ApiResponseBuilder().setData(data).setMessage('Categoría actualizada').build();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una categoría (los modelos quedan sin categoría)' })
  async remove(@Param('id') id: string): Promise<ApiResponse> {
    const data = await this.categoriesService.delete(id);
    return new ApiResponseBuilder().setData(data).setMessage('Categoría eliminada').build();
  }
}
