import { Body, Controller, Get, Put, Res, UseGuards } from '@nestjs/common';
import { ApiResponseBuilder, FiscalProfileDto, UserRole } from '@tesseract/types';
import { Response } from 'express';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { FiscalProfileService } from '../../fiscal-profile.service';
import { UpsertFiscalProfileDto } from '../../dto/upsert-fiscal-profile.dto';

@Controller('fiscal-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalProfileController {
  constructor(private readonly fiscalProfileService: FiscalProfileService) {}

  /**
   * Devuelve 200 con `null` cuando no hay perfil, no 404: "esta organización todavía no ha
   * llenado sus datos" es un estado normal —son opcionales— y el front necesita distinguirlo
   * de un fallo para poder pintar el formulario vacío.
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async get(
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<FiscalProfileDto | null>>> {
    const profile = await this.fiscalProfileService.get(user.organizationId);

    const apiResponse = new ApiResponseBuilder<FiscalProfileDto | null>()
      .setStatusCode(200)
      .setMessage('Fiscal profile retrieved successfully')
      .setData(profile);

    return res.status(200).json(apiResponse.build());
  }

  @Put()
  @Roles(UserRole.OWNER)
  async upsert(
    @CurrentUser() user: UserPayload,
    @Body() body: UpsertFiscalProfileDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<FiscalProfileDto>>> {
    const profile = await this.fiscalProfileService.upsert(user.organizationId, body);

    const apiResponse = new ApiResponseBuilder<FiscalProfileDto>()
      .setStatusCode(200)
      .setMessage('Fiscal profile saved successfully')
      .setData(profile);

    return res.status(200).json(apiResponse.build());
  }
}
