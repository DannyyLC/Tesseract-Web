import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiResponse,
  ApiResponseBuilder,
  PaginatedResponse,
  GetToolsDto,
  UserRole,
} from '@tesseract/types';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { ToolsCatalogService } from '../../tools-catalog.service';
import { RolesGuard } from '../../../../auth/guards/roles.guard';
import { Roles } from '../../../../auth/decorators/roles.decorator';

@Controller('tools-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ToolsCatalogController {
  constructor(private readonly toolsCatalogService: ToolsCatalogService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async getAllToolsWithFunctions(
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('search') search: string | null = null,
  ): Promise<Response<ApiResponse<PaginatedResponse<GetToolsDto>>>> {
    const apiResponse = new ApiResponseBuilder<PaginatedResponse<GetToolsDto>>();

    const result = await this.toolsCatalogService.getAllToolsWithFunctions(
      cursor,
      pageSize,
      action,
      search ? { search } : undefined,
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
