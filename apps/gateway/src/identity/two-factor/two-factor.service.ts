import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Secret, TOTP } from 'otpauth';
import { Logger } from 'winston';
import { PrismaService } from '@/platform/database/prisma.service';
import {
  BACKUP_CODE_COUNT,
  TOTP_ISSUER,
  TOTP_PERIOD,
  TOTP_SECRET_BYTES,
  TOTP_WINDOW,
} from './two-factor.constants';
import { BackupCodeUtil } from './utils/backup-code.util';

/** Lo que necesita el front para dar de alta el 2FA en su app autenticadora. */
export interface TwoFactorSetup {
  /** URL `otpauth://` que se codifica en el QR. */
  otpauthUrl: string;
  /** El mismo secreto en base32, para quien no pueda escanear el QR. */
  base32Secret: string;
}

/**
 * Dueño único de la verificación del segundo factor.
 *
 * Todos los flujos que piden un código 2FA (login, cambio de contraseña, salir
 * de la organización, borrarla, desactivar 2FA) pasan por `verifySecondFactor`,
 * de modo que la política —ventana de tolerancia, anti-replay y aceptación de
 * códigos de respaldo— vive en un solo sitio.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Genera un secreto nuevo y la URL `otpauth://` correspondiente.
   *
   * No persiste nada: quien llama decide dónde guardarlo.
   *
   * @param email - Email del usuario; se usa como etiqueta visible en la app autenticadora
   */
  generateSetup(email: string): TwoFactorSetup {
    const secret = new Secret({ size: TOTP_SECRET_BYTES });
    const totp = new TOTP({
      issuer: TOTP_ISSUER,
      label: email,
      period: TOTP_PERIOD,
      secret,
    });

    return { otpauthUrl: totp.toString(), base32Secret: secret.base32 };
  }

  /**
   * Verifica un código TOTP contra un secreto.
   *
   * @returns El delta respecto al paso actual (0 = paso en curso, ±1 = adyacente),
   *   o `null` si el código no es válido.
   */
  verifyTotp(base32Secret: string, code: string): number | null {
    const normalized = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return null;
    }

    let totp: TOTP;
    try {
      totp = new TOTP({
        period: TOTP_PERIOD,
        secret: Secret.fromBase32(base32Secret.replace(/\s/g, '').toUpperCase()),
      });
    } catch {
      // Secreto corrupto o con un formato que no es base32: no es un código válido,
      // pero tampoco un error del servidor.
      return null;
    }

    return totp.validate({ token: normalized, window: TOTP_WINDOW });
  }

  /**
   * Punto de entrada único para validar el segundo factor de un usuario.
   *
   * Acepta tanto un código TOTP como uno de respaldo: quien perdió el teléfono
   * necesita poder completar exactamente las mismas acciones.
   *
   * @param userId - Usuario que presenta el código
   * @param code - Código de 6 dígitos de la app autenticadora, o uno de respaldo
   */
  async verifySecondFactor(userId: string, code: string): Promise<boolean> {
    if (!code) {
      return false;
    }

    // Un código de respaldo tiene 10 caracteres; uno TOTP, 6 dígitos. La forma
    // basta para decidir sin tocar la base de datos.
    if (BackupCodeUtil.looksLikeBackupCode(code)) {
      return this.consumeBackupCode(userId, code);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorLastUsedStep: true },
    });

    if (!user?.twoFactorSecret) {
      return false;
    }

    const delta = this.verifyTotp(user.twoFactorSecret, code);
    if (delta === null) {
      this.logger.warn(`2FA: código TOTP inválido para userId=${userId}`);
      return false;
    }

    // Anti-replay: el mismo código sirve durante los 30s de su paso (más la
    // ventana de tolerancia). Sin esto, quien lo intercepte puede reutilizarlo.
    const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD) + delta;
    if (user.twoFactorLastUsedStep !== null && step <= user.twoFactorLastUsedStep) {
      this.logger.warn(`2FA: código TOTP reutilizado para userId=${userId}`);
      return false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorLastUsedStep: step },
    });

    return true;
  }

  /**
   * Sustituye los códigos de respaldo del usuario por un juego nuevo.
   *
   * Devuelve los códigos en claro y es la **única** oportunidad de verlos: en la
   * base de datos solo queda su hash.
   */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => BackupCodeUtil.generate());

    await this.prisma.$transaction([
      this.prisma.userBackupCode.deleteMany({ where: { userId } }),
      this.prisma.userBackupCode.createMany({
        data: codes.map((code) => ({ userId, codeHash: BackupCodeUtil.hash(code) })),
      }),
    ]);

    this.logger.info(`2FA: ${codes.length} códigos de respaldo emitidos para userId=${userId}`);

    return codes;
  }

  /**
   * Gasta un código de respaldo si existe y no se había usado.
   *
   * El `updateMany` condicionado a `usedAt: null` hace el chequeo y la marca en
   * una sola sentencia, así que dos peticiones simultáneas con el mismo código
   * no pueden gastarlo dos veces.
   */
  async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const { count } = await this.prisma.userBackupCode.updateMany({
      where: { userId, codeHash: BackupCodeUtil.hash(code), usedAt: null },
      data: { usedAt: new Date() },
    });

    if (count === 0) {
      this.logger.warn(`2FA: código de respaldo inválido o ya usado para userId=${userId}`);
      return false;
    }

    const remaining = await this.countRemainingBackupCodes(userId);
    this.logger.info(
      `2FA: código de respaldo consumido por userId=${userId}, quedan ${remaining}`,
    );

    return true;
  }

  /** Cuántos códigos de respaldo le quedan sin usar al usuario. */
  countRemainingBackupCodes(userId: string): Promise<number> {
    return this.prisma.userBackupCode.count({ where: { userId, usedAt: null } });
  }

  /** Invalida todos los códigos de respaldo del usuario (al desactivar el 2FA). */
  async deleteBackupCodes(userId: string): Promise<void> {
    await this.prisma.userBackupCode.deleteMany({ where: { userId } });
  }
}
