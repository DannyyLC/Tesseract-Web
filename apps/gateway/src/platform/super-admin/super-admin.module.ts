import { Module } from '@nestjs/common';
import { UtilityModule } from '../utility/utility.module';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';

/**
 * Bootstrap del super admin a partir de variables de entorno.
 * PrismaService está disponible globalmente (DatabaseModule @Global);
 * UtilityModule aporta el hasheo de contraseña.
 */
@Module({
  imports: [UtilityModule],
  providers: [SuperAdminBootstrapService],
})
export class SuperAdminModule {}
