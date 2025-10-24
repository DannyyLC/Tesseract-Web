import { 
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query, 
    UseGuards,
    HttpCode,
    HttpStatus,
} from "@nestjs/common";
import { WorkflowsService } from "./workflows.service";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { CurrentClient } from "../auth/decorators/current-client.decorator";
import { ClientPayload } from '../common/types/client-payload.type';

/**
 * Controller de Workflows
 * Maneja todas las peticiones HTTP relacionadas con workflows
 * 
 * Todas las rutas están protegidas con ApiKeyGuard
 * Base path: /api/workflows
 */
@Controller('workflows')
@UseGuards(ApiKeyGuard)
export class WorkflowsController {
    constructor(private readonly workflowsService: WorkflowsService) {}

    /**
   * POST /api/workflows
   * Crear un nuevo workflow
   * 
   * Headers requeridos:
   *   x-api-key: ak_live_xxx...
   * 
   * Body:
   *   {
   *     "name": "Mi Workflow",
   *     "description": "Descripción",
   *     "config": { "type": "n8n", ... },
   *     ...
   *   }
   * 
   * Response: 201 Created
   *   {
   *     "id": "uuid",
   *     "name": "Mi Workflow",
   *     ...
   *   }
   */

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(
        @CurrentClient() client: ClientPayload,
        @Body() createDto: CreateWorkflowDto,
    ) {
        return this.workflowsService.create(client.id, createDto)
    }

    /**
   * GET /api/workflows
   * Listar todos los workflows del cliente
   * 
   * Query params opcionales:
   *   ?includeDeleted=true  - Incluir workflows eliminados
   * 
   * Headers requeridos:
   *   x-api-key: ak_live_xxx...
   * 
   * Response: 200 OK
   *   [
   *     { "id": "uuid", "name": "Workflow 1", ... },
   *     { "id": "uuid", "name": "Workflow 2", ... }
   *   ]
   */
  @Get()
  findAll(
    @CurrentClient() client: ClientPayload,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.workflowsService.findAll(client.id, includeDeletedBool);
  }

  /**
   * GET /api/workflows/:id
   * Obtener un workflow específico
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   x-api-key: ak_live_xxx...
   * 
   * Response: 200 OK
   *   {
   *     "id": "uuid",
   *     "name": "Mi Workflow",
   *     "tags": [...],
   *     "executions": [...]
   *   }
   * 
   * Errores:
   *   404 - Workflow no encontrado
   */
  @Get(':id')
  findOne(
    @CurrentClient() client: ClientPayload,
    @Param('id') id: string,
  ) {
    return this.workflowsService.findOne(client.id, id);
  }

  /**
   * PUT /api/workflows/:id
   * Actualizar un workflow
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   x-api-key: ak_live_xxx...
   * 
   * Body (todos los campos opcionales):
   *   {
   *     "name": "Nuevo nombre",
   *     "description": "Nueva descripción",
   *     ...
   *   }
   * 
   * Response: 200 OK
   *   {
   *     "id": "uuid",
   *     "name": "Nuevo nombre",
   *     "version": 2,  
   *     ...
   *   }
   * 
   * Errores:
   *   404 - Workflow no encontrado
   *   400 - Datos inválidos
   */
  @Put(':id')
  update(
    @CurrentClient() client: ClientPayload,
    @Param('id') id: string,
    @Body() updateDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(client.id, id, updateDto);
  }

  /**
   * DELETE /api/workflows/:id
   * Eliminar un workflow (soft delete)
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   x-api-key: ak_live_xxx...
   * 
   * Response: 200 OK
   *   {
   *     "message": "Workflow eliminado exitosamente",
   *     "workflow": { ... }
   *   }
   * 
   * Errores:
   *   404 - Workflow no encontrado
   */
  @Delete(':id')
  remove(
    @CurrentClient() client: ClientPayload,
    @Param('id') id: string,
  ) {
    return this.workflowsService.remove(client.id, id);
  }
}
