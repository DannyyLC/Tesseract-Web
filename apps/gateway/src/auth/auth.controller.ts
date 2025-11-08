import { 
  Controller, 
  Post, 
  Get,
  Body, 
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { ClientPayload } from '../common/types/client-payload.type';

/**
 * AuthController maneja todos los endpoints de autenticación
 * 
 * 🔐 SEGURIDAD: Usa cookies httpOnly para almacenar tokens
 * - Los tokens NO se retornan en el body del response
 * - Se establecen como cookies httpOnly + secure + sameSite
 * - Protección contra XSS (Cross-Site Scripting)
 * 
 * Endpoints públicos (no requieren autenticación):
 * - POST /auth/login
 * - POST /auth/refresh
 * 
 * Endpoints protegidos (requieren JWT):
 * - GET /auth/me
 * - POST /auth/logout
 * - POST /auth/logout-all
 * 
 * Nota: El registro de usuarios está protegido y solo puede ser realizado
 * por administradores a través de /admin/users
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Inicia sesión con email y password
   * 
   * 🔐 Los tokens se establecen como cookies httpOnly (NO en el body)
   * 
   * Body:
   *   {
   *     "email": "juan@example.com",
   *     "password": "password123"
   *   }
   * 
   * Response: 200 OK
   *   {
   *     "user": {
   *       "id": "uuid",
   *       "name": "Juan Pérez",
   *       "email": "juan@example.com",
   *       "plan": "free",
   *       "isActive": true
   *     }
   *   }
   * 
   * Cookies establecidas:
   *   - accessToken: httpOnly, secure, sameSite=strict, maxAge=15min
   *   - refreshToken: httpOnly, secure, sameSite=strict, maxAge=7days
   * 
   * Errores:
   *   401 - Credenciales inválidas
   *   401 - Cuenta inactiva o eliminada
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Determinar si estamos en producción
    const isProduction = process.env.NODE_ENV === 'production';

    // Establecer accessToken en cookie httpOnly
    response.cookie('accessToken', result.accessToken, {
      httpOnly: true,       // No accesible desde JavaScript
      secure: isProduction, // Solo HTTPS en producción
      sameSite: 'strict',   // Protección CSRF
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    // Establecer refreshToken en cookie httpOnly
    response.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/api/auth', // Solo se envía a endpoints de auth
    });

    // Retornar solo la info del usuario (NO los tokens)
    return {
      user: result.user,
    };
  }

  /**
   * POST /auth/refresh
   * Refresca el access token usando el refresh token de la cookie
   * 
   * 🔐 Lee el refreshToken desde la cookie (NO desde el body)
   * 
   * Body: {} (vacío, no se necesita enviar nada)
   * 
   * Response: 200 OK
   *   {
   *     "success": true
   *   }
   * 
   * Cookies actualizadas:
   *   - accessToken: nuevo token (15 minutos)
   *   - refreshToken: nuevo token rotado (7 días)
   * 
   * Nota: El refresh token antiguo se invalida (token rotation)
   * 
   * Errores:
   *   401 - Refresh token inválido o expirado
   *   401 - Cookie refreshToken no encontrada
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Leer refreshToken desde la cookie
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new Error('Refresh token no encontrado en las cookies');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    // Determinar si estamos en producción
    const isProduction = process.env.NODE_ENV === 'production';

    // Establecer nuevo accessToken
    response.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    // Establecer nuevo refreshToken (rotado)
    response.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/api/auth',
    });

    return {
      success: true,
    };
  }

  /**
   * GET /auth/me
   * Obtiene la información del usuario autenticado
   * 
   * 🔐 El accessToken se lee automáticamente desde la cookie
   * 
   * Headers: (ninguno requerido, la cookie se envía automáticamente)
   * 
   * Response: 200 OK
   *   {
   *     "id": "uuid",
   *     "name": "Juan Pérez",
   *     "email": "juan@example.com",
   *     "plan": "free",
   *     "maxWorkflows": 10,
   *     "maxExecutionsPerDay": 100,
   *     "isActive": true,
   *     "region": "us-central",
   *     "metadata": {...}
   *   }
   * 
   * Errores:
   *   401 - Token inválido o expirado
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: ClientPayload) {
    return user;
  }

  /**
   * POST /auth/logout
   * Cierra sesión invalidando el refresh token y limpiando las cookies
   * 
   * 🔐 Lee el refreshToken desde la cookie y la elimina
   * 
   * Headers: (ninguno requerido, las cookies se envían automáticamente)
   * Body: {} (vacío)
   * 
   * Response: 200 OK
   *   {
   *     "message": "Sesión cerrada exitosamente"
   *   }
   * 
   * Cookies eliminadas:
   *   - accessToken
   *   - refreshToken
   * 
   * Nota: Solo invalida el refresh token específico de esta sesión
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Leer refreshToken desde la cookie
    const refreshToken = request.cookies?.refreshToken;

    if (refreshToken) {
      // Invalidar el refresh token en la base de datos
      await this.authService.logout(refreshToken);
    }

    // Limpiar las cookies
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/api/auth' });

    return { message: 'Sesión cerrada exitosamente' };
  }

  /**
   * POST /auth/logout-all
   * Cierra sesión en todos los dispositivos
   * Invalida TODOS los refresh tokens del usuario y limpia las cookies
   * 
   * 🔐 Invalida todas las sesiones del usuario en todos los dispositivos
   * 
   * Headers: (ninguno requerido, las cookies se envían automáticamente)
   * 
   * Response: 200 OK
   *   {
   *     "message": "Sesión cerrada en todos los dispositivos"
   *   }
   * 
   * Cookies eliminadas:
   *   - accessToken
   *   - refreshToken
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: ClientPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Invalidar TODOS los refresh tokens del usuario
    await this.authService.logoutAll(user.id);

    // Limpiar las cookies de esta sesión
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/api/auth' });

    return { message: 'Sesión cerrada en todos los dispositivos' };
  }
}
