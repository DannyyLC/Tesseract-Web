import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { ConversationsService } from '../../conversations.service';
import { QueryConversationsAdminDto, RenameConversationAdminDto } from '../../dto';

/**
 * Conversaciones de un workflow, para el super admin.
 *
 * Sirve para rastrear un error que reportó un cliente: navegar (y opcionalmente
 * continuar, desde la pestaña Probar) cualquier conversación real del workflow — no
 * solo las de prueba, cualquier canal. Solo lectura + renombrar; el resto de acciones
 * (cerrar, marcar HITL, etc.) siguen siendo del dueño de la organización, no del admin.
 */
@ApiTags('Admin - Conversations')
@ApiBearerAuth('access-token')
@Controller('admin/conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ConversationsAdminController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar conversaciones de un workflow (paginado, filtro por error)' })
  async findAll(@Query() query: QueryConversationsAdminDto): Promise<ApiResponse> {
    const result = await this.conversationsService.findAllForAdmin(query);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una conversación: mensajes + ejecución de cada turno' })
  async findOne(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Query('workflowId') workflowId: string,
  ): Promise<ApiResponse> {
    // Sin este chequeo, un query param ausente queda `undefined` y Prisma lo ignora en
    // el `where` — devolvería cualquier conversación con ese id, sin importar de qué
    // organización o workflow (mismo gotcha documentado en getTestExecution()).
    if (!organizationId || !workflowId) {
      throw new BadRequestException('organizationId y workflowId son requeridos');
    }

    const result = await this.conversationsService.findOneForAdmin(organizationId, workflowId, id);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar una conversación' })
  async rename(@Param('id') id: string, @Body() dto: RenameConversationAdminDto): Promise<ApiResponse> {
    await this.conversationsService.renameForAdmin(dto.organizationId, id, dto.title);
    return new ApiResponseBuilder().setMessage('Conversación renombrada').build();
  }
}
