import { GetToolsDto } from '@/tools-catalog/dto/get-tools.dto';
import { Controller, DefaultValuePipe, Get, HttpStatus, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiResponseBuilder, CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { Response } from 'express';
import { ToolsCatalogService } from '../../tools-catalog.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

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

    const tools = await this.toolsCatalogService.getAllToolsWithFunctions(
        cursor,
        pageSize,
        action,
        search ? { search } : undefined
    );
    if (!tools) {
        apiResponse
        .setMessage('No tools found')
        .setSuccess(false)
        .setStatusCode(HttpStatus.NOT_FOUND);
    } else {
        apiResponse
        .setData(tools)
        .setMessage('Tools retrieved successfully')
        .setStatusCode(HttpStatus.OK)
        .setSuccess(true);
    }
    return res.json(apiResponse.build());
  }
}
