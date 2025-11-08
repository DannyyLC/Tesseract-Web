import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

/**
 * AdminController - Endpoints para administración de usuarios
 * 
 * TODOS los endpoints requieren:
 * 1. JWT válido (JwtAuthGuard)
 * 2. Usuario con plan 'admin' (AdminGuard)
 * 3. Header X-Admin-Key con el valor correcto (AdminGuard)
 * 
 * Esta es una estrategia multi-capa para proteger operaciones críticas
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /admin/users
   * Crea un nuevo usuario (solo admins)
   * 
   * Headers requeridos:
   *   Authorization: Bearer <accessToken>
   *   X-Admin-Key: <admin-api-key>
   * 
   * Body:
   *   {
   *     "name": "Usuario Nuevo",
   *     "email": "usuario@example.com",
   *     "password": "password123",
   *     "plan": "pro",  // Opcional: free|pro|enterprise|admin (default: free)
   *     "limits": {     // Opcional: límites personalizados
   *       "maxWorkflows": 100,
   *       "maxExecutionsPerDay": 50000,
   *       "maxApiKeys": 20
   *     }
   *   }
   * 
   * Response: 201 Created
   *   {
   *     "id": "uuid",
   *     "name": "Usuario Nuevo",
   *     "email": "usuario@example.com",
   *     "plan": "pro",
   *     "limits": {...},
   *     "isActive": true,
   *     "createdAt": "2025-11-07T..."
   *   }
   * 
   * Errores:
   *   401 - No autenticado o no es admin
   *   403 - X-Admin-Key inválido
   *   409 - Email ya registrado
   *   400 - Datos inválidos
   */
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto);
  }

  /**
   * GET /admin/users
   * Lista todos los usuarios del sistema
   * 
   * Headers requeridos:
   *   Authorization: Bearer <accessToken>
   *   X-Admin-Key: <admin-api-key>
   * 
   * Query params opcionales:
   *   ?includeDeleted=true - Incluir usuarios eliminados
   * 
   * Response: 200 OK
   *   [
   *     {
   *       "id": "uuid",
   *       "name": "Usuario 1",
   *       "email": "user1@example.com",
   *       "plan": "free",
   *       "isActive": true,
   *       "createdAt": "2025-11-07T...",
   *       "_count": {
   *         "workflows": 3,
   *         "apiKeys": 2
   *       }
   *     },
   *     ...
   *   ]
   * 
   * Nota: Los passwords nunca se retornan
   */
  @Get('users')
  async listUsers(@Query('includeDeleted') includeDeleted?: string) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.authService.listUsers(includeDeletedBool);
  }

  /**
   * DELETE /admin/users/:id
   * Elimina (soft delete) un usuario del sistema
   * 
   * Headers requeridos:
   *   Authorization: Bearer <accessToken>
   *   X-Admin-Key: <admin-api-key>
   * 
   * Params:
   *   id - UUID del usuario a eliminar
   * 
   * Response: 200 OK
   *   {
   *     "id": "uuid",
   *     "name": "Usuario Nombre",
   *     "email": "usuario@example.com",
   *     "deletedAt": "2025-11-08T..."
   *   }
   * 
   * Errores:
   *   401 - No autenticado o no es admin
   *   403 - X-Admin-Key inválido
   *   404 - Usuario no encontrado
   *   409 - Usuario ya está eliminado
   * 
   * Nota: Es un soft delete (deletedAt se actualiza)
   * Nota: Se invalidan todos los refresh tokens del usuario
   */
  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }
}
