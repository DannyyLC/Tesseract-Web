import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/user-payload.type';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * Controlador de gestión de usuarios
 * 
 * Endpoints protegidos por JWT y roles
 * Owner y Admin pueden invitar usuarios
 * Solo Owner puede eliminar usuarios
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Invita un nuevo usuario a la organización
   * 
   * POST /users/invite
   * 
   * Solo Owner y Admin pueden invitar
   */
  @Post('invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async invite(@CurrentUser() user: UserPayload, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.organizationId, user.role as UserRole, dto);
  }

  /**
   * Lista todos los usuarios de la organización
   * 
   * GET /users
   * 
   * Todos los usuarios autenticados pueden ver la lista
   */
  @Get()
  async findAll(@CurrentUser() user: UserPayload) {
    return this.usersService.findAll(user.organizationId);
  }

  /**
   * Obtiene un usuario específico
   * 
   * GET /users/:id
   */
  @Get(':id')
  async findOne(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.usersService.findOne(id, user.organizationId);
  }

  /**
   * Actualiza el rol o estado de un usuario
   * 
   * PUT /users/:id
   * 
   * Solo Owner puede cambiar roles
   */
  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(
      id,
      user.organizationId,
      user.role as UserRole,
      user.sub,
      dto,
    );
  }

  /**
   * Elimina un usuario (soft delete)
   * 
   * DELETE /users/:id
   * 
   * Solo Owner puede eliminar usuarios
   */
  @Delete(':id')
  @Roles(UserRole.OWNER)
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.usersService.remove(
      id,
      user.organizationId,
      user.role as UserRole,
      user.sub,
    );
  }
}
