import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LlmModelsService } from '../llm-models/llm-models.service';
import {
  CreateLlmModelDto,
  UpdateLlmModelDto,
  QueryLlmModelsDto,
} from '../llm-models/dto';
import { SuperAdminGuard } from './guards/super-admin.guard';

@ApiTags('Admin - LLM Models')
@Controller('admin/llm-models')
@UseGuards(SuperAdminGuard)
@ApiBearerAuth()
export class AdminLlmModelsController {
  constructor(private readonly llmModelsService: LlmModelsService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo modelo LLM',
    description: 'Registra un nuevo modelo de IA con sus precios y características. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Modelo LLM creado exitosamente',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Solo SUPER_ADMIN puede crear modelos',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Ya existe un modelo con ese nombre en el rango de fechas especificado',
  })
  create(@Body() createLlmModelDto: CreateLlmModelDto) {
    return this.llmModelsService.create(createLlmModelDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos los modelos LLM',
    description: 'Obtiene lista paginada de modelos con filtros. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de modelos LLM con paginación',
  })
  findAll(@Query() query: QueryLlmModelsDto) {
    return this.llmModelsService.findAll(query);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Obtener solo modelos activos',
    description: 'Lista de modelos LLM activos y vigentes. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de modelos activos',
  })
  getActiveModels() {
    return this.llmModelsService.getActiveModels();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un modelo LLM por ID',
    description: 'Detalle completo de un modelo específico. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Modelo LLM encontrado',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Modelo no encontrado',
  })
  findOne(@Param('id') id: string) {
    return this.llmModelsService.findOne(id);
  }

  @Get('model/:modelName')
  @ApiOperation({
    summary: 'Obtener modelo vigente por nombre',
    description: 'Obtiene los detalles vigentes de un modelo por su nombre. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Modelo encontrado',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Modelo no encontrado',
  })
  getModelByName(@Param('modelName') modelName: string) {
    return this.llmModelsService.getModel(modelName);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un modelo LLM',
    description: 'Actualiza tier, categoría, precios o estado de un modelo. Para desactivar un modelo, usar isActive: false. Solo SUPER_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Modelo actualizado exitosamente',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Modelo no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Solo SUPER_ADMIN puede actualizar modelos',
  })
  update(
    @Param('id') id: string,
    @Body() updateLlmModelDto: UpdateLlmModelDto,
  ) {
    return this.llmModelsService.update(id, updateLlmModelDto);
  }
}
