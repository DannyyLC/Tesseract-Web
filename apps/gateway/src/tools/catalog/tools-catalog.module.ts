import { Module } from '@nestjs/common';
import { ToolsCatalogService } from './tools-catalog.service';
import { ToolsCatalogController } from './controllers/user-ui/tools-catalog.controller';
import { PrismaService } from '../../database/prisma.service';
import { UtilityModule } from '../../utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [ToolsCatalogService, PrismaService],
  controllers: [ToolsCatalogController],
})
export class ToolsCatalogModule {}
