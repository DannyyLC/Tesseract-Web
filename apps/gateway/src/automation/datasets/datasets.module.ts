import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatasetQueryController } from './controllers/internal/dataset-query.controller';
import { DatasetsController } from './controllers/user-ui/datasets.controller';
import { DatasetAccessGuard } from './core/dataset-access.guard';
import { DatasetQueryService } from './core/dataset-query.service';
import { DatasetTokenService } from './core/dataset-token.service';
import { DatasetsService } from './core/datasets.service';

/**
 * `JwtModule.register({})` sin secreto a propósito: el token de consulta se firma con
 * `DATASET_TOKEN_SECRET`, que se pasa por llamada en `DatasetTokenService`. Registrar aquí el
 * secreto de sesión haría que un token de dataset y uno de usuario fueran intercambiables.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [DatasetsService, DatasetQueryService, DatasetTokenService, DatasetAccessGuard],
  controllers: [DatasetsController, DatasetQueryController],
  exports: [DatasetsService, DatasetQueryService, DatasetTokenService],
})
export class DatasetsModule {}
