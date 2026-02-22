import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiResponseBuilder, CursorPaginatedResponse, GetToolsDto } from '@tesseract/types';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { ToolsCatalogService } from '../../tools-catalog.service';

@Controller('tools-catalog')
@UseGuards(JwtAuthGuard)
export class ToolsCatalogController {
  constructor(private readonly toolsCatalogService: ToolsCatalogService) {}

  @Get()
  async getAllToolsWithFunctions(
    @Res() res: Response,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('search') search: string | null = null,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<GetToolsDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<GetToolsDto>>();

    const result = await this.toolsCatalogService.getAllToolsWithFunctions(
      cursor,
      pageSize,
      action,
      search ? { search } : undefined
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
