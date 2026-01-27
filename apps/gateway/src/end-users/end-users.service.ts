import { PrismaService } from '../database/prisma.service';
import { Injectable } from '@nestjs/common';
import { DashboardEndUserDto } from './dto/dashboard-end-user.dto';
import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';

@Injectable()
export class EndUsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardData(
    idOrganization: string,
    cursor: string | null = null,
    pageSize: number = 10,
    paginationAction: 'next' | 'prev' | null = null,
  ): Promise<CursorPaginatedResponse<DashboardEndUserDto>> {
    const endUsers = await this.prismaService.endUser.findMany({
      where: {
        organizationId: idOrganization,
      },
      skip: cursor ? 1 : 0,
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        externalId: true,
        name: true,
        avatar: true,
        metadata: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const paginatedData = await CursorPaginatedResponseUtils.getInstance().build(
      endUsers,
      pageSize,
      paginationAction,
    );
    const transformmedData = paginatedData.items.map((eu) => {
      const { id, ...rest } = eu;
      return rest;
    });

    return {
      ...paginatedData,
      items: transformmedData,
    };
  }
}
