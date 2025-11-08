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
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentClient } from "../auth/decorators/current-client.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ClientPayload } from '../common/types/client-payload.type';

/**
 * Controller de Workflows
 * Maneja todas las peticiones HTTP relacionadas con workflows
 * 
 * ESTRATEGIA DE AUTENTICACIÓN:
 * - JWT (Token): Para gestión CRUD (crear, listar, editar, eliminar) - Solo UI
 * - API Key: Para ejecución de workflows - Apps externas
 * 
 * Base path: /workflows
 */
@Controller('workflows')
export class WorkflowsController {
    constructor(private readonly workflowsService: WorkflowsService) {}

    /**
   * POST /workflows
   * Crear un nuevo workflow
   * 
   * ⚠️ Requiere JWT (solo desde UI)
   * 
   * Headers requeridos:
   *   Authorization: Bearer <JWT token>
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
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.CREATED)
    create(
        @CurrentUser() user: ClientPayload,
        @Body() createDto: CreateWorkflowDto,
    ) {
        return this.workflowsService.create(user.id, createDto)
    }

    /**
   * GET /workflows
   * Listar todos los workflows del cliente
   * 
   * ⚠️ Requiere JWT (solo desde UI)
   * 
   * Query params opcionales:
   *   ?includeDeleted=true  - Incluir workflows eliminados
   * 
   * Headers requeridos:
   *   Authorization: Bearer <JWT token>
   * 
   * Response: 200 OK
   *   [
   *     { "id": "uuid", "name": "Workflow 1", ... },
   *     { "id": "uuid", "name": "Workflow 2", ... }
   *   ]
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() user: ClientPayload,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.workflowsService.findAll(user.id, includeDeletedBool);
  }

  /**
   * GET /workflows/:id
   * Obtener un workflow específico
   * 
   * ⚠️ Requiere JWT (solo desde UI)
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   Authorization: Bearer <JWT token>
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
  @UseGuards(JwtAuthGuard)
  findOne(
    @CurrentUser() user: ClientPayload,
    @Param('id') id: string,
  ) {
    return this.workflowsService.findOne(user.id, id);
  }

  /**
   * PUT /workflows/:id
   * Actualizar un workflow
   * 
   * ⚠️ Requiere JWT (solo desde UI)
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   Authorization: Bearer <JWT token>
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
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: ClientPayload,
    @Param('id') id: string,
    @Body() updateDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(user.id, id, updateDto);
  }

  /**
   * DELETE /workflows/:id
   * Eliminar un workflow (soft delete)
   * 
   * ⚠️ Requiere JWT (solo desde UI)
   * 
   * Params:
   *   :id - UUID del workflow
   * 
   * Headers requeridos:
   *   Authorization: Bearer <JWT token>
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
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: ClientPayload,
    @Param('id') id: string,
  ) {
    return this.workflowsService.remove(user.id, id);
  }

  /**
   * POST /workflows/:id/execute
   * Ejecutar un workflow
   * 
   * ⚠️ Requiere API KEY (para apps externas)
   * Este es el endpoint MÁS IMPORTANTE del sistema.
   * Permite a apps externas ejecutar workflows con su API Key.
   * 
   * Params:
   *   :id - UUID del workflow a ejecutar
   * 
   * Headers requeridos:
   *   X-API-Key: ak_live_xxx...
   * 
   * Body:
   *   {
   *     "input": {
   *       "leadName": "Juan Pérez",
   *       "email": "juan@example.com",
   *       ...cualquier dato que necesite el workflow
   *     },
   *     "metadata": {
   *       "source": "api",
   *       "campaign": "summer-2024"
   *       ...metadata adicional para tracking
   *     }
   *   }
   * 
   * Response: 201 Created
   *   {
   *     "id": "execution-789",
   *     "workflowId": "workflow-456",
   *     "status": "completed",
   *     "startedAt": "2025-11-05T10:30:00Z",
   *     "finishedAt": "2025-11-05T10:30:12Z",
   *     "duration": 12,
   *     "result": {
   *       ...resultado del workflow desde n8n
   *     },
   *     "trigger": "api"
   *   }
   * 
   * Errores posibles:
   *   404 - Workflow no encontrado
   *   403 - Workflow pausado o inactivo
   *   429 - Límite de ejecuciones diarias excedido
   *   400 - Config del workflow inválido
   *   502 - Error al comunicarse con n8n
   *   504 - Timeout del webhook de n8n
   *   500 - Error interno
   * 
   * Flujo interno:
   * 1. Validar que el workflow existe y pertenece al cliente
   * 2. Verificar límites diarios
   * 3. Crear registro de Execution (status="pending")
   * 4. Llamar al webhook de n8n con los datos
   * 5. Actualizar Execution con el resultado
   * 6. Retornar la ejecución completa
   */
  @Post(':id/execute')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @CurrentClient() client: ClientPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ) {
    return this.workflowsService.execute(
      client.id,
      id,
      executeDto.input,
      executeDto.metadata,
    );
  }
}
