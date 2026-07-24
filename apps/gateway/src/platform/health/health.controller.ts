import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../database/prisma.service';

/**
 * Endpoints de salud para las probes de Cloud Run.
 *
 * Se separan liveness y readiness a propósito: si la base de datos se cae,
 * queremos que Cloud Run deje de mandar tráfico (readiness en 503) pero NO que
 * reinicie el contenedor (liveness sigue en 200), porque reiniciar no arregla
 * una base caída y solo agrega cold starts.
 *
 * Ambas rutas son públicas y saltan el ThrottlerGuard global: las probes pegan
 * seguido y consumirían la cuota de rate limiting.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: ¿el proceso responde? No toca dependencias externas. */
  @SkipThrottle()
  @Get()
  liveness() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: ¿podemos atender tráfico de verdad? Verifica la base de datos. */
  @SkipThrottle()
  @Get('ready')
  async readiness(@Res() res: Response): Promise<Response> {
    const database = await this.prisma.healthCheck();

    return res.status(database ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: database ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    });
  }
}
