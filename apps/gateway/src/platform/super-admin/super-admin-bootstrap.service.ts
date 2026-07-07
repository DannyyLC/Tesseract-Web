import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@tesseract/database';
import { SubscriptionPlan } from '@tesseract/types';
import { PrismaService } from '@/platform/database/prisma.service';
import { UtilityService } from '@/platform/utility/utility.service';

/**
 * Crea (o actualiza de forma idempotente) la cuenta super admin a partir de
 * variables de entorno al arrancar la aplicación.
 *
 * El super admin es un operador de plataforma, no un inquilino: vive en una
 * organización dedicada y vacía ("platform"). Nunca se crea desde la UI —
 * `UsersService.updateRole` rechaza asignar SUPER_ADMIN vía API a propósito.
 *
 * Las variables de entorno son la fuente de la verdad: en cada arranque se
 * resetea la contraseña al valor de `SUPER_ADMIN_PASSWORD`, de modo que rotar
 * la variable rota el acceso. Si `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` no
 * están definidas, no se hace nada.
 */
@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  // Slug fijo y reservado de la organización de plataforma.
  private static readonly PLATFORM_ORG_SLUG = 'platform';
  private static readonly PLATFORM_ORG_NAME = 'Platform';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly utility: UtilityService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');
    const name = this.config.get<string>('SUPER_ADMIN_NAME')?.trim() || 'Super Admin';

    if (!email || !password) {
      this.logger.log(
        'SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD no configuradas — se omite el bootstrap del super admin.',
      );
      return;
    }

    try {
      const hashedPassword = await this.utility.hashPassword(password);

      // 1. Organización de plataforma (dedicada y vacía).
      const platformOrg = await this.prisma.organization.upsert({
        where: { slug: SuperAdminBootstrapService.PLATFORM_ORG_SLUG },
        update: {},
        create: {
          name: SuperAdminBootstrapService.PLATFORM_ORG_NAME,
          slug: SuperAdminBootstrapService.PLATFORM_ORG_SLUG,
          plan: SubscriptionPlan.FREE,
          isActive: true,
          allowOverages: false,
        },
      });

      // 2. Usuario super admin (idempotente por email; env = fuente de la verdad).
      await this.prisma.user.upsert({
        where: { email },
        update: {
          name,
          password: hashedPassword,
          role: UserRole.SUPER_ADMIN,
          organizationId: platformOrg.id,
          isActive: true,
          emailVerified: true,
          deletedAt: null,
        },
        create: {
          email,
          name,
          password: hashedPassword,
          role: UserRole.SUPER_ADMIN,
          organizationId: platformOrg.id,
          isActive: true,
          emailVerified: true,
        },
      });

      this.logger.log(`Super admin listo: ${email} (organización de plataforma "${platformOrg.slug}").`);
    } catch (error) {
      // No abortamos el arranque de la app por un fallo aquí; solo lo registramos.
      this.logger.error(
        `Error al hacer bootstrap del super admin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
