import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TempTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const tempToken = request.cookies?.temp2FAToken;
    if (!tempToken) {
      throw new UnauthorizedException('Temp token required');
    }
    try {
      const secret =
        this.configService.get<string>('TEMP_TOKEN_SECRET') ??
        'temp-token-secret';
      const payload = this.jwtService.verify(tempToken, { secret });
      // Optionally attach payload to request for later use
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired temp token');
    }
  }
}
