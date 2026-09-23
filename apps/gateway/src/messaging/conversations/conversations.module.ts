import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ToolsModule } from '@/automation/tools/core/tools.module';
import { ConversationsController } from './controllers/user-ui/conversations.controller';
import { ConversationsAdminController } from './controllers/admin/conversations.admin.controller';
import { InterventionController } from './controllers/internal/intervention.controller';
import { ConversationsService } from './conversations.service';
import { InterventionAccessGuard } from './core/intervention-access.guard';
import { InterventionTokenService } from './core/intervention-token.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { MediaProcessingModule } from '@/automation/media-processing/media-processing.module';

/**
 * ConversationsModule
 * Centraliza toda la lógica de gestión de conversaciones
 *
 * `JwtModule.register({})` sin secreto a propósito: el token de intervención se firma con
 * `INTERVENTION_TOKEN_SECRET` (ver `InterventionTokenService`), no con un secreto por defecto del
 * módulo.
 */
@Module({
  imports: [UtilityModule, MediaProcessingModule, HttpModule, ToolsModule, JwtModule.register({})],
  providers: [ConversationsService, InterventionTokenService, InterventionAccessGuard],
  exports: [ConversationsService, InterventionTokenService],
  controllers: [ConversationsController, ConversationsAdminController, InterventionController],
})
export class ConversationsModule {}
