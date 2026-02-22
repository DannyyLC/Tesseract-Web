import { Inject, Injectable } from '@nestjs/common';
import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { CursorPaginatedResponseUtils } from '../../common/responses/cursor-paginated-response';
import { PrismaService } from '../../database/prisma.service';
import { CreateTenantToolDto } from '../tenant/dto/create-tenant-tool.dto';
import { DashboardTenantToolDto } from './dto/dashboard-tenant-tool.dto';
import { UpdateTenantToolDto } from './dto/update-tenant-tool.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class TenantToolService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getDashboardData(
    organizationId: string,
    cursor: string | null = null,
    pageSize = 10,
    paginationAction: 'next' | 'prev' | null = null,
  ): Promise<CursorPaginatedResponse<DashboardTenantToolDto> | null> {
    try {
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
    } catch (error: any) {
      this.logger.error(`Error fetching dashboard data: ${error?.message || 'Unknown error'}`);
      return null;
    }
  }

  async getTenantToolById(
    id: string
  ): Promise<DashboardTenantToolDto | null> {
    try {
      const tenantTool = await this.prismaService.tenantTool.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
        },
      });
      return tenantTool;
    } catch (error: any) {
      this.logger.error(`Error fetching tenant tool with ID ${id}: ${error?.message || 'Unknown error'}`);
      return null;
    }
  }

  async createTenantTool(
    data: CreateTenantToolDto,
    organizationId: string,
    userId: string,
  ) {
    try {
      return await this.prismaService.tenantTool.create({
        data: {
          toolCatalogId: data.toolCatalogId,
          displayName: data.displayName,
          config: data.config,
          allowedFunctions: data.allowedFunctions,
          organizationId: organizationId,
          createdByUserId: userId,
          workflows: {
            connect: data.workflowId ? [{ id: data.workflowId }] : [],
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Error creating tenant tool: ${error?.message || 'Unknown error'}`);
      return null;
    }
  }

  async updateTenantTool(id: string, data: UpdateTenantToolDto) {
    const { workflows, ...restData } = data;
    const workflowConnectionArray = workflows?.map((workflowId) => ({ id: workflowId }));
    try {
      return await this.prismaService.tenantTool.update({
        where: { id },
        data: {
          ...restData,
          ...(workflows && {
            workflows: {
              set: workflowConnectionArray || [],
            },
          }),
        },
      });
    } catch (error: any) {
      this.logger.error(`Error updating tenant tool with ID ${id}: ${error?.message || 'Unknown error'}`);
      return null;
    }
  }

  async addWorkflowToTenantTool(tenantToolId: string, workflowIds: string[]) {
    try {
      return await this.prismaService.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          workflows: {
            connect: workflowIds.map((id) => ({ id })),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Error adding workflows to tenant tool with ID ${tenantToolId}: ${error?.message || 'Unknown error'}`);
      return null;
    }
  }
}
