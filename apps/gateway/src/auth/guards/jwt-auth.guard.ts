import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard para proteger rutas que requieren autenticación JWT
 * 
 * 🔐 Lee el accessToken desde la cookie httpOnly (NO desde el header)
 * 
 * Uso:
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: ClientPayload) {
 *   return user;
 * }
 * 
 * Flujo:
 * 1. Extrae el token de la cookie 'accessToken'
 * 2. Lo inyecta en el header Authorization para que Passport lo procese
 * 3. Usa JwtStrategy para validar el token
 * 4. Si es válido, inyecta request.user con el ClientPayload
 * 5. Si no es válido, lanza UnauthorizedException
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Extrae el token de la cookie y lo prepara para Passport
   */
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Extraer accessToken de la cookie
    const accessToken = request.cookies?.accessToken;
    
    // Si existe el token en la cookie, inyectarlo en el header Authorization
    // para que Passport JWT lo pueda procesar
    if (accessToken) {
      request.headers.authorization = `Bearer ${accessToken}`;
    }
    
    // Llamar al método canActivate de AuthGuard('jwt')
    // que automáticamente usa JwtStrategy
    return super.canActivate(context);
  }
}
