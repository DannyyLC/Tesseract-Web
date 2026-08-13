import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { BillingService } from '../../billing.service';
import { AdminUpdateSubscriptionDto } from '../../dto/admin-update-subscription.dto';

/**
 * Edición manual de suscripción para el super admin. Vive aparte de `BillingController`
 * (que resuelve la organización desde el JWT del propio tenant) porque acá el super admin
 * opera sobre una organización arbitraria por `:id`.
 */
@ApiTags('Admin - Subscription')
@ApiBearerAuth('access-token')
@Controller('admin/organizations/:id/subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SubscriptionAdminController {
  constructor(private readonly billingService: BillingService) {}

  @Put()
  @ApiOperation({
    summary: 'Editar plan/estado/período a mano (solo organizaciones sin Stripe)',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateSubscriptionDto,
  ): Promise<ApiResponse> {
    await this.billingService.adminSetManualSubscription(id, dto);
    return new ApiResponseBuilder().setMessage('Suscripción actualizada').build();
  }
}
