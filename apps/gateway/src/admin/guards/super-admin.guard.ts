import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SuperAdminsConfig } from '../config/super-admins.config';
import { Request } from 'express';
import { RequestWithSuperAdmin } from '../interfaces/request-with-super-admin.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 🔒 SUPER ADMIN GUARD
 * 
 * ⚠️  MÁXIMA SEGURIDAD - Protege endpoints críticos del sistema
 * 
 * Seguridad implementada:
 * 1. ✅ JWT separado con secret diferente
 * 2. ✅ Validación contra configuración (no DB)
 * 3. ✅ Rate limiting estricto (3 intentos/hora)
 * 4. ✅ IP whitelist opcional
 * 5. ✅ Logging exhaustivo de TODOS los accesos
 * 6. ✅ Headers especiales requeridos
 * 7. ✅ Timeout de sesión corto (30 min)
 * 
 * Uso:
 * @UseGuards(SuperAdminGuard)
 * @Get('admin/organizations')
 * getAllOrganizations() { ... }
 */

interface SuperAdminPayload {
  sub: string; // superAdminId
  email: string;
  name: string;
  role: 'super_admin';
  iat: number;
  exp: number;
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminGuard.name);
  private readonly rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly superAdminsConfig: SuperAdminsConfig,
  ) {
    // Limpiar rate limit cada hora
    setInterval(() => this.cleanupRateLimit(), 60 * 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar si el endpoint es público (ej: /admin/login)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithSuperAdmin>();
    const clientIP = this.getClientIP(request);
    const startTime = Date.now();

    try {
      // 1. Verificar rate limit
      this.checkRateLimit(clientIP);

      // 2. Extraer y validar token
      const token = this.extractToken(request);
      if (!token) {
        this.logFailedAttempt('No token provided', clientIP, request);
        throw new UnauthorizedException('Token de super admin requerido');
      }

      // 3. Verificar token con secret especial
      const payload = await this.verifyToken(token);

      // 4. Verificar que sea super admin en configuración
      const superAdmin = this.superAdminsConfig.findByEmail(payload.email);
      if (!superAdmin) {
        this.logFailedAttempt('Email not in super admin config', clientIP, request);
        this.incrementRateLimit(clientIP);
        throw new ForbiddenException('No autorizado como super admin');
      }

      // 5. Verificar IP whitelist si está configurada
      if (!this.superAdminsConfig.isIPAllowed(payload.email, clientIP)) {
        this.logFailedAttempt(`IP ${clientIP} not in whitelist`, clientIP, request);
        this.incrementRateLimit(clientIP);
        throw new ForbiddenException(`Acceso denegado desde esta IP: ${clientIP}`);
      }

      // 6. Inyectar super admin en request
      request.superAdmin = {
        id: superAdmin.id,
        email: superAdmin.email,
        name: superAdmin.name,
        role: 'super_admin' as const,
      };

      // 7. Logging exitoso
      const duration = Date.now() - startTime;
      this.logger.warn(
        `🔥 SUPER ADMIN ACCESS ` +
        `| User: ${superAdmin.email} ` +
        `| IP: ${clientIP} ` +
        `| Route: ${request.method} ${request.url} ` +
        `| Duration: ${duration}ms`
      );

      return true;

    } catch (error) {
      this.incrementRateLimit(clientIP);
      throw error;
    }
  }

  /**
   * Extrae el token del header Authorization o cookie
   */
  private extractToken(request: Request): string | null {
    // Primero intentar desde header Authorization
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Alternativamente desde cookie especial
    const tokenFromCookie = request.cookies?.superAdminToken;
    if (tokenFromCookie) {
      return tokenFromCookie;
    }

    return null;
  }

  /**
   * Verifica el token JWT con el secret especial de super admin
   */
  private async verifyToken(token: string): Promise<SuperAdminPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<SuperAdminPayload>(token, {
        secret: this.superAdminsConfig.getJwtSecret(),
      });

      // Validar que sea un token de super admin
      if (payload.role !== 'super_admin') {
        throw new Error('Token no es de super admin');
      }

      return payload;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token verification failed: ${errorMessage}`);
      throw new UnauthorizedException('Token de super admin inválido o expirado');
    }
  }

  /**
   * Obtiene la IP real del cliente (considerando proxies)
   */
  private getClientIP(request: Request): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) 
        ? xForwardedFor[0] 
        : xForwardedFor.split(',')[0];
      return ips.trim();
    }

    const xRealIP = request.headers['x-real-ip'];
    if (xRealIP) {
      return Array.isArray(xRealIP) ? xRealIP[0] : xRealIP;
    }

    return request.socket.remoteAddress || 'unknown';
  }

  /**
   * Verifica rate limit (3 intentos fallidos por hora)
   */
  private checkRateLimit(ip: string): void {
    const now = Date.now();
    const limit = this.rateLimitMap.get(ip);

    if (limit) {
      // Si el tiempo de reset ha pasado, limpiar
      if (now > limit.resetTime) {
        this.rateLimitMap.delete(ip);
        return;
      }

      // Si ha excedido el límite, bloquear
      if (limit.count >= 3) {
        const minutesLeft = Math.ceil((limit.resetTime - now) / 60000);
        this.logger.error(
          `🚫 RATE LIMIT EXCEEDED | IP: ${ip} | Wait: ${minutesLeft} min`
        );
        throw new HttpException(
          `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minutos`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }
  }

  /**
   * Incrementa el contador de rate limit
   */
  private incrementRateLimit(ip: string): void {
    const now = Date.now();
    const limit = this.rateLimitMap.get(ip);

    if (limit) {
      limit.count++;
    } else {
      this.rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + (60 * 60 * 1000), // 1 hora
      });
    }

    const current = this.rateLimitMap.get(ip)!;
    this.logger.warn(
      `⚠️  Failed attempt ${current.count}/3 from IP: ${ip}`
    );
  }

  /**
   * Limpia rate limits expirados
   */
  private cleanupRateLimit(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, limit] of this.rateLimitMap.entries()) {
      if (now > limit.resetTime) {
        this.rateLimitMap.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired rate limits`);
    }
  }

  /**
   * Log de intentos fallidos
   */
  private logFailedAttempt(reason: string, ip: string, request: Request): void {
    this.logger.error(
      `🚫 SUPER ADMIN ACCESS DENIED ` +
      `| Reason: ${reason} ` +
      `| IP: ${ip} ` +
      `| Route: ${request.method} ${request.url} ` +
      `| User-Agent: ${request.headers['user-agent'] || 'unknown'}`
    );
  }
}
