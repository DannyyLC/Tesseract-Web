import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * 🔒 CONFIGURACIÓN DE SUPER ADMINISTRADORES
 * 
 * ⚠️ MÁXIMA SEGURIDAD - Este archivo define quiénes pueden acceder al sistema completo
 * 
 * Los super admins se definen en variables de entorno, NO en base de datos.
 * Esto previene:
 * - Escalación de privilegios vía SQL injection
 * - Modificación no autorizada de permisos
 * - Acceso a super admin si la BD es comprometida
 * 
 * Seguridad implementada:
 * 1. ✅ Credenciales en .env (nunca en código)
 * 2. ✅ Passwords hasheados con bcrypt
 * 3. ✅ Secret key especial para JWT
 * 4. ✅ Rate limiting estricto (3 intentos/hora)
 * 5. ✅ IP whitelist opcional
 * 6. ✅ Logging exhaustivo de TODAS las acciones
 * 7. ✅ 2FA obligatorio (futuro)
 */

export interface SuperAdmin {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  allowedIPs?: string[]; // Opcional: restricción por IP
}

/**
 * Carga los super admins desde las variables de entorno
 * 
 * Formato esperado en .env:
 * 
 * SUPER_ADMIN_SECRET=ultra-secret-key-change-this-in-production
 * 
 * # Super Admin Principal
 * SUPER_ADMIN_1_ID=sa-001
 * SUPER_ADMIN_1_EMAIL=admin@yourdomain.com
 * SUPER_ADMIN_1_PASSWORD_HASH=$2b$10$... (bcrypt hash)
 * SUPER_ADMIN_1_NAME=John Doe
 * SUPER_ADMIN_1_ALLOWED_IPS=192.168.1.100,10.0.0.5 (opcional)
 * 
 * # Puedes agregar más (hasta SUPER_ADMIN_5)
 * SUPER_ADMIN_2_ID=sa-002
 * SUPER_ADMIN_2_EMAIL=admin2@yourdomain.com
 * ...
 * 
 * Para generar el password hash:
 * node -e "console.log(require('bcrypt').hashSync('your-password', 10))"
 */
export class SuperAdminsConfig {
  private readonly superAdmins: Map<string, SuperAdmin> = new Map();
  private readonly jwtSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.loadJwtSecret();
    this.loadSuperAdmins();
    this.validateConfig();
  }

  /**
   * Carga el secret especial para JWT de super admins
   */
  private loadJwtSecret(): string {
    const secret = this.configService.get<string>('SUPER_ADMIN_SECRET');
    
    if (!secret) {
      throw new Error(
        '❌ SUPER_ADMIN_SECRET no está definido en .env\n' +
        'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
      );
    }

    if (secret.length < 32) {
      throw new Error('❌ SUPER_ADMIN_SECRET debe tener al menos 32 caracteres');
    }

    return secret;
  }

  /**
   * Carga los super admins desde variables de entorno
   */
  private loadSuperAdmins(): void {
    const maxAdmins = 5; // Límite de super admins

    for (let i = 1; i <= maxAdmins; i++) {
      const prefix = `SUPER_ADMIN_${i}`;
      
      const id = this.configService.get<string>(`${prefix}_ID`);
      const email = this.configService.get<string>(`${prefix}_EMAIL`);
      const passwordHash = this.configService.get<string>(`${prefix}_PASSWORD_HASH`);
      const name = this.configService.get<string>(`${prefix}_NAME`);
      const allowedIPsStr = this.configService.get<string>(`${prefix}_ALLOWED_IPS`);

      // Si no hay ID, asumimos que no existe más super admins
      if (!id) {
        if (i === 1) {
          console.warn('⚠️  No hay super admins configurados en .env');
        }
        break;
      }

      // Validar que todos los campos requeridos estén presentes
      if (!email || !passwordHash || !name) {
        throw new Error(
          `❌ Configuración incompleta para ${prefix}\n` +
          `Requerido: ${prefix}_EMAIL, ${prefix}_PASSWORD_HASH, ${prefix}_NAME`
        );
      }

      // Validar formato de email
      if (!this.isValidEmail(email)) {
        throw new Error(`❌ Email inválido para ${prefix}: ${email}`);
      }

      // Validar que sea un hash de bcrypt
      if (!this.isBcryptHash(passwordHash)) {
        throw new Error(
          `❌ ${prefix}_PASSWORD_HASH no parece ser un hash de bcrypt\n` +
          `Genera uno con: node -e "console.log(require('bcrypt').hashSync('your-password', 10))"`
        );
      }

      const allowedIPs = allowedIPsStr 
        ? allowedIPsStr.split(',').map(ip => ip.trim())
        : undefined;

      this.superAdmins.set(email.toLowerCase(), {
        id,
        email: email.toLowerCase(),
        passwordHash,
        name,
        allowedIPs,
      });

      console.log(`✅ Super Admin cargado: ${email} (ID: ${id})`);
    }
  }

  /**
   * Valida la configuración completa
   */
  private validateConfig(): void {
    if (this.superAdmins.size === 0) {
      console.warn(
        '\n⚠️  ============================================\n' +
        '⚠️  NO HAY SUPER ADMINS CONFIGURADOS\n' +
        '⚠️  Los endpoints de /admin no estarán disponibles\n' +
        '⚠️  ============================================\n'
      );
    } else {
      console.log(
        `\n✅ Sistema de Super Admins inicializado\n` +
        `   Super Admins configurados: ${this.superAdmins.size}\n` +
        `   JWT Secret: ✅ Configurado\n`
      );
    }
  }

  /**
   * Valida email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida que sea un hash de bcrypt
   */
  private isBcryptHash(hash: string): boolean {
    // Bcrypt hash tiene formato: $2a$10$... o $2b$10$...
    return /^\$2[aby]\$\d{2}\$.{53}$/.test(hash);
  }

  /**
   * Obtiene el JWT secret para super admins
   */
  getJwtSecret(): string {
    return this.jwtSecret;
  }

  /**
   * Busca un super admin por email
   */
  findByEmail(email: string): SuperAdmin | undefined {
    return this.superAdmins.get(email.toLowerCase());
  }

  /**
   * Verifica si un email es super admin
   */
  isSuperAdmin(email: string): boolean {
    return this.superAdmins.has(email.toLowerCase());
  }

  /**
   * Verifica las credenciales de un super admin
   */
  async verifyCredentials(email: string, password: string): Promise<SuperAdmin | null> {
    const admin = this.findByEmail(email);
    
    if (!admin) {
      return null;
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    
    return isValid ? admin : null;
  }

  /**
   * Verifica si una IP está permitida para un super admin
   */
  isIPAllowed(email: string, clientIP: string): boolean {
    const admin = this.findByEmail(email);
    
    if (!admin) {
      return false;
    }

    // Si no hay whitelist, cualquier IP es válida
    if (!admin.allowedIPs || admin.allowedIPs.length === 0) {
      return true;
    }

    // Verificar que la IP esté en la whitelist
    return admin.allowedIPs.includes(clientIP);
  }

  /**
   * Obtiene todos los super admins (sin passwords)
   */
  getAllSuperAdmins(): Array<Omit<SuperAdmin, 'passwordHash'>> {
    return Array.from(this.superAdmins.values()).map(({ passwordHash, ...admin }) => admin);
  }

  /**
   * Cuenta cuántos super admins hay
   */
  count(): number {
    return this.superAdmins.size;
  }
}
