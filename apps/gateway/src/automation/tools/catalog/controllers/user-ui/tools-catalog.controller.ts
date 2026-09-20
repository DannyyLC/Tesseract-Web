import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Locale } from '@/platform/common/decorators/locale.decorator';
import { SupportedLocale } from '@/platform/common/types/locale.type';
import {
  ApiResponse,
  ApiResponseBuilder,
  DEFAULT_PAGE_SIZE,
  GetToolsDto,
  PaginatedResponse,
  UserRole,
} from '@tesseract/types';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { ToolsCatalogService } from '../../tools-catalog.service';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';

@Controller('tools-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ToolsCatalogController {
  constructor(private readonly toolsCatalogService: ToolsCatalogService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getAllToolsWithFunctions(
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('search') search: string | null = null,
    @Locale() locale: SupportedLocale,
  ): Promise<Response<ApiResponse<PaginatedResponse<GetToolsDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<GetToolsDto>>();

    const result = await this.toolsCatalogService.getAllToolsWithFunctions(
      cursor,
      pageSize,
      action,
      search ? { search } : undefined,
      locale,
    );

    if (result.items.length === 0) {
      apiResponse
        .setMessage('No tools found')
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.NotFound);
      return res.status(HttpStatusCode.NotFound).json(apiResponse.build());
    } else {
      apiResponse
        .setData(result)
        .setMessage('Tools retrieved successfully')
        .setStatusCode(HttpStatusCode.Ok)
        .setSuccess(true);
      return res.status(HttpStatusCode.Ok).json(apiResponse.build());
    }
  }
}
