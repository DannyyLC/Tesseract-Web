import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { TransactionType } from '@tesseract/database';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { CreditsService } from '../../credits.service';
import { AdminAdjustCreditsDto } from '../../dto/admin-adjust-credits.dto';

/**
 * Créditos para el super admin: balance + historial de una organización arbitraria, y el ajuste
 * manual (`TransactionType.MANUAL_ADJUSTMENT`). Vive aparte de las rutas de `/billing` (que
 * resuelven la organización desde el JWT del propio tenant).
 */
@ApiTags('Admin - Credits')
@ApiBearerAuth('access-token')
@Controller('admin/organizations/:id/credits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CreditsAdminController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  @ApiOperation({ summary: 'Balance de créditos + historial paginado por cursor' })
  async getDashboard(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('direction') direction?: 'next' | 'prev',
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse> {
    const result = await this.creditsService.getDashboardData(
      id,
      cursor ?? null,
      pageSize ? Number(pageSize) : 10,
      direction ?? null,
    );
    return new ApiResponseBuilder().setData(result).build();
  }

  @Post('adjust')
  @ApiOperation({ summary: 'Sumar o restar créditos a mano, con motivo obligatorio' })
  async adjust(
    @Param('id') id: string,
    @Body() dto: AdminAdjustCreditsDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    await this.creditsService.addCredits(
      id,
      dto.amount,
      TransactionType.MANUAL_ADJUSTMENT,
      dto.reason,
      { adjustedBy: user.email },
    );
    const result = await this.creditsService.getDashboardData(id);
    return new ApiResponseBuilder().setData(result).build();
  }
}
