import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginatedResponse } from '@tesseract/types';
import { CursorPaginatedResponseUtils } from '../../common/responses/cursor-paginated-response';
import { PrismaService } from '../../database/prisma.service';
import { CreateTenantToolDto } from '../tenant/dto/create-tenant-tool.dto';
import { DashboardTenantToolDto } from '@tesseract/types';
import { UpdateTenantToolDto } from './dto/update-tenant-tool.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Prisma } from '@prisma/client';

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
        where: {
          organizationId,
          deletedAt: null,
          status: { not: 'deleted' },
        },
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        take:
          paginationAction === 'next' || paginationAction === null
            ? (pageSize ?? 10) + 1
            : -((pageSize ?? 10) + 1),
        select: {
          id: true,
          displayName: true,
          status: true,
          isConnected: true,
          createdAt: true,
          allowedFunctions: true,
          toolCatalog: {
            select: {
              toolName: true,
              displayName: true,
              icon: true,
              category: true,
              provider: true,
            },
          },
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

  async getTenantToolById(id: string): Promise<DashboardTenantToolDto | null> {
    try {
      const tenantTool = await this.prismaService.tenantTool.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
          status: true,
          isConnected: true,
          createdAt: true,
          allowedFunctions: true,
          toolCatalog: {
            select: {
              toolName: true,
              displayName: true,
              icon: true,
              category: true,
              provider: true,
            },
          },
        },
      });
      return tenantTool;
    } catch (error: any) {
      this.logger.error(
        `Error fetching tenant tool with ID ${id}: ${error?.message || 'Unknown error'}`,
      );
      return null;
    }
  }

  async createTenantTool(data: CreateTenantToolDto, organizationId: string, userId: string) {
    try {
      // Fetch tool catalog to check provider
      const catalog = await this.prismaService.toolCatalog.findUnique({
        where: { id: data.toolCatalogId },
        select: { provider: true },
      });

      if (!catalog) {
        throw new NotFoundException('Tool catalog entry not found');
      }

      // Determine if it should be connected immediately
      // If provider is 'none', 'custom' or empty, it doesn't need OAuth
      const noAuthRequired =
        !catalog.provider ||
        catalog.provider.toLowerCase() === 'none' ||
        catalog.provider.toLowerCase() === 'custom';

      const tenantTool = await this.prismaService.tenantTool.create({
        data: {
          displayName: data.displayName,
          organizationId,
          toolCatalogId: data.toolCatalogId,
          allowedFunctions: data.allowedFunctions,
          config: data.config,
          createdByUserId: userId,
          isConnected: noAuthRequired,
          status: noAuthRequired ? 'connected' : 'pending',
          workflows: {
            connect: data.workflowId ? [{ id: data.workflowId }] : [],
          },
        },
      });
      return tenantTool;
    } catch (error: any) {
      this.logger.error(`Error creating tenant tool: ${error?.message || 'Unknown error'}`);
      throw error;
    }
  }

  async updateTenantTool(id: string, data: UpdateTenantToolDto) {
    try {
      return await this.prismaService.tenantTool.update({
        where: { id },
        data: {
          displayName: data.displayName,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error updating tenant tool with ID ${id}: ${error?.message || 'Unknown error'}`,
      );
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
      this.logger.error(
        `Error adding workflows to tenant tool with ID ${tenantToolId}: ${error?.message || 'Unknown error'}`,
      );
      return null;
    }
  }

  async removeWorkflowFromTenantTool(tenantToolId: string, workflowIds: string[]) {
    try {
      return await this.prismaService.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          workflows: {
            disconnect: workflowIds.map((id) => ({ id })),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error removing workflows from tenant tool with ID ${tenantToolId}: ${error?.message || 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Executes a strict Hard-Delete on the OAuth credentials and a Soft-Delete on the tool instance.
   */
  async deleteTool(tenantToolId: string, orgId: string, userId: string, role: string) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== 'owner') {
      throw new Error('No tienes permisos para desconectar esta herramienta');
    }

    await this.prismaService.$transaction(async (tx) => {
      // HARD DELETE of PII Secrets Bóveda
      await tx.tenantToolCredential.deleteMany({
        where: { tenantToolId },
      });

      // SOFT DELETE of shell (to keep execution history) y status update
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          status: 'deleted',
          isConnected: false,
          deletedAt: new Date(),
        },
      });
    });
  }

  /**
   * Wipes sensitive credentials and configuration data, resetting the tool to a
   * 'pending' state. This allows for reconnection while ensuring no PII persists.
   */
  async disconnectTool(tenantToolId: string, orgId: string, userId: string, role: string) {
    const tool = await this.prismaService.tenantTool.findFirst({
      where: { id: tenantToolId, organizationId: orgId },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    if (tool.createdByUserId && tool.createdByUserId !== userId && role !== 'owner') {
      throw new Error('No tienes permisos para desconectar esta herramienta');
    }

    await this.prismaService.$transaction(async (tx) => {
      // HARD DELETE of PII Secrets Bóveda
      await tx.tenantToolCredential.deleteMany({
        where: { tenantToolId },
      });

      // SOFT DELETE of shell (to keep execution history) y status update
      await tx.tenantTool.update({
        where: { id: tenantToolId },
        data: {
          status: 'pending',
          isConnected: false,
          config: Prisma.DbNull,
        },
      });
    });
  }
}
