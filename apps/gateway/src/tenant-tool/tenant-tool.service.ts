import { PrismaService } from '../database/prisma.service';
import { Injectable } from '@nestjs/common';
import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { DashboardTenantToolDto } from './dto/dashboard-tenant-tool.dto';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';

@Injectable()
export class TenantToolService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardData(
    organizationId: string,
    cursor: string | null = null,
    pageSize: number = 10,
    paginationAction: 'next' | 'prev' | null = null,
  ): Promise<CursorPaginatedResponse<DashboardTenantToolDto>> {
    const tenantTools = await this.prismaService.tenantTool.findMany({
      where: { organizationId },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take:
        paginationAction === 'next' || paginationAction === null
          ? (pageSize ?? 10) + 1
          : -((pageSize ?? 10) + 1),
      select: {
        id: true,
        displayName: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return await CursorPaginatedResponseUtils.getInstance().build(
      tenantTools,
      pageSize,
      paginationAction,
    );
  }
}
