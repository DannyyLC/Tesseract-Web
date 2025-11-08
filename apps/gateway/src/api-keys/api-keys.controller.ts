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
    HttpStatus 
} from "@nestjs/common";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { UpdateApiKeyDto } from "./dto/update-api-key.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ClientPayload } from "../common/types/client-payload.type";

/**
 * Controller de API Keys
 * Maneja la creación, listado, eliminación y activación/desactivación de API Keys
 * 
 * Base path: /api-keys
 * Todos los endpoints requieren autenticación JWT (desde la UI)
 * Las API Keys son para apps externas, su gestión solo se hace desde la UI con JWT
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
    constructor(private readonly apiKeysService: ApiKeysService) {}

    /**
     * POST /api-keys
     * Crea un nuevo API Key para el usuario autenticado
     * 
     * Headers requeridos:
     *   Authorization: Bearer <JWT token>
     * 
     * Body:
     *   {
     *     "name": "Production Key",
     *     "scopes": ["workflows:read", "workflows:execute"],  // opcional
     *     "expiresAt": "2025-12-31T23:59:59Z"                 // opcional
     *   }
     * 
     * Response: 201 Created
     *   {
     *     "id": "uuid",
     *     "name": "Production Key",
     *     "apiKey": "ak_live_abc123...",  ⚠️ SOLO SE MUESTRA AQUÍ
     *     "keyPrefix": "ak_live_ab",
     *     "isActive": true,
     *     "scopes": ["workflows:read", "workflows:execute"],
     *     "expiresAt": "2025-12-31T23:59:59Z",
     *     "createdAt": "2025-11-07T10:30:00Z"
     *   }
     * 
     * Errores:
     *   401 - JWT token inválido o no proporcionado
     *   403 - Límite de API Keys alcanzado
     *   400 - Datos inválidos
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(
        @CurrentUser() user: ClientPayload,
        @Body() createDto: CreateApiKeyDto,
    ) {
        return this.apiKeysService.create(user.id, createDto);
    }

    /**
     * GET /api-keys
     * Lista todos los API Keys del usuario autenticado
     * 
     * Headers requeridos:
     *   Authorization: Bearer <JWT token>
     * 
     * Response: 200 OK
     *   [
     *     {
     *       "id": "uuid",
     *       "name": "Production Key",
     *       "keyPrefix": "ak_live_ab",  ← Solo prefijo, no el valor completo
     *       "isActive": true,
     *       "lastUsedAt": "2025-11-07T09:00:00Z",
     *       "expiresAt": null,
     *       "createdAt": "2025-11-01T10:00:00Z",
     *       "updatedAt": "2025-11-07T09:00:00Z"
     *     },
     *     ...
     *   ]
     * 
     * Errores:
     *   401 - JWT token inválido o no proporcionado
     */
    @Get()
    async findAll(@CurrentUser() user: ClientPayload) {
        return this.apiKeysService.findAll(user.id);
    }

    /**
     * GET /api-keys/:id
     * Obtiene detalles de un API Key específico
     * 
     * Params:
     *   :id - UUID del API Key
     * 
     * Headers requeridos:
     *   Authorization: Bearer <JWT token>
     * 
     * Response: 200 OK
     *   {
     *     "id": "uuid",
     *     "name": "Production Key",
     *     "keyPrefix": "ak_live_ab",
     *     "isActive": true,
     *     "lastUsedAt": "2025-11-07T09:00:00Z",
     *     "expiresAt": null,
     *     "scopes": ["workflows:read"],
     *     "createdAt": "2025-11-01T10:00:00Z",
     *     "updatedAt": "2025-11-07T09:00:00Z",
     *     "deletedAt": null
     *   }
     * 
     * Errores:
     *   401 - JWT token inválido
     *   403 - No tienes permiso para ver este API Key
     *   404 - API Key no encontrado
     */
    @Get(':id')
    async findOne(
        @CurrentUser() user: ClientPayload,
        @Param('id') id: string,
    ) {
        return this.apiKeysService.findOne(user.id, id);
    }

    /**
     * DELETE /api-keys/:id
     * Elimina un API Key (soft delete)
     * El API Key se marca como eliminado pero no se borra de la DB
     * 
     * Params:
     *   :id - UUID del API Key a eliminar
     * 
     * Headers requeridos:
     *   Authorization: Bearer <JWT token>
     * 
     * Response: 204 No Content
     *   {
     *     "success": true,
     *     "message": "API Key eliminada exitosamente"
     *   }
     * 
     * Errores:
     *   401 - JWT token inválido
     *   403 - No tienes permiso para eliminar este API Key
     *   404 - API Key no encontrado
     */
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async delete(
        @CurrentUser() user: ClientPayload,
        @Param('id') id: string,
    ) {
        return this.apiKeysService.delete(user.id, id);
    }

    /**
     * PATCH /api-keys/:id
     * Actualiza un API Key (nombre y/o estado activo)
     * Permite actualizar el nombre y/o activar/desactivar el API Key
     * 
     * Params:
     *   :id - UUID del API Key
     * 
     * Headers requeridos:
     *   Authorization: Bearer <JWT token>
     * 
     * Body (todos los campos son opcionales):
     *   {
     *     "name": "Nuevo nombre",      // opcional
     *     "isActive": false             // opcional
     *   }
     * 
     * Ejemplos de uso:
     *   - Solo cambiar nombre: { "name": "Production API v2" }
     *   - Solo desactivar: { "isActive": false }
     *   - Ambos: { "name": "Testing", "isActive": true }
     * 
     * Response: 200 OK
     *   {
     *     "success": true,
     *     "apiKey": {
     *       "id": "uuid",
     *       "name": "Nuevo nombre",
     *       "keyPrefix": "ak_live_ab",
     *       "isActive": false,
     *       "lastUsedAt": "2025-11-07T09:00:00Z",
     *       "expiresAt": null,
     *       "createdAt": "2025-11-01T10:00:00Z",
     *       "updatedAt": "2025-11-07T10:30:00Z"
     *     },
     *     "message": "API Key actualizada exitosamente"
     *   }
     * 
     * Errores:
     *   401 - JWT token inválido
     *   403 - No tienes permiso o el API Key está eliminado, o no se proporcionaron campos
     *   404 - API Key no encontrado
     *   400 - Datos inválidos
     */
    @Patch(':id')
    async update(
        @CurrentUser() user: ClientPayload,
        @Param('id') id: string,
        @Body() updateDto: UpdateApiKeyDto,
    ) {
        return this.apiKeysService.update(user.id, id, updateDto);
    }
}
