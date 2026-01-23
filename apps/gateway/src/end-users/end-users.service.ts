import { PrismaService } from '../database/prisma.service';
import { Injectable } from '@nestjs/common';
import { DashboardEndUserDto } from './dto/dashboard-end-user.dto';

@Injectable()
export class EndUsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardData(
    idOrganization: string,
    initPage: number = 1,
    pageSize: number = 10,
  ): Promise<{ items: DashboardEndUserDto[]; totalPages: number }> {
    const totalEndUsers = await this.prismaService.endUser.count({
      where: {
        organizationId: idOrganization,
      },
    });
    const totalPages = Math.ceil(totalEndUsers / pageSize);
    const endUsers = await this.prismaService.endUser.findMany({
      where: {
        organizationId: idOrganization,
      },
      skip: initPage > 0 ? (initPage - 1) * pageSize : 0,
      take: pageSize,
      select: {
        phoneNumber: true,
        email: true,
        externalId: true,
        name: true,
        avatar: true,
        metadata: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return { items: endUsers, totalPages };
  }
}
