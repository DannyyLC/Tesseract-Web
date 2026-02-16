import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GetToolsDto } from './dto/get-tools.dto';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { Prisma } from '@workflow-platform/database';

@Injectable()
export class ToolsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllToolsWithFunctions(
    cursor?: string | null,
    take = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: {
      search?: string;
    },
  ): Promise<CursorPaginatedResponse<GetToolsDto>> {
    const where: Prisma.ToolCatalogWhereInput = {
      ...(filters?.search && {
        OR: [
          { toolName: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { provider: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };
    
    const tools = await this.prisma.toolCatalog.findMany({
      where,
      skip: cursor ? 1 : 0,
      take: paginationAction === 'next' || paginationAction === null ? take + 1 : -(take + 1),
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        functions: true,
      },
      orderBy: { displayName: 'asc' },
    });

    const sanitizedTools = tools.map((tool) => ({
      id: tool.id,
      toolName: tool.toolName,
      displayName: tool.displayName ?? '',
      description: tool.description ?? '',
      provider: tool.provider ?? '',
      isActive: tool.isActive,
      isInBeta: tool.isInBeta,
      icon: tool.icon ?? '',
      category: tool.category ?? '',
      functions: tool.functions.map((fn) => ({
        id: fn.id,
        functionName: fn.functionName,
        displayName: fn.displayName ?? '',
        description: fn.description ?? '',
        category: fn.category ?? '',
        isActive: fn.isActive,
        isInBeta: fn.isInBeta,
        icon: fn.icon ?? '',
        dangerLevel: fn.dangerLevel ?? '',
      })),
    }));
    const paginatedTools = await CursorPaginatedResponseUtils.getInstance().build(
      sanitizedTools,
      take,
      paginationAction,
    );
    return paginatedTools;
  }
}
