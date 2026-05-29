import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import axios from 'axios';

@Injectable()
export class TurnstileService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async verifyToken(token?: string): Promise<void> {
    const secretKey = this.configService.get<string>('TURNSTILE_SECRET_KEY');

    if (!secretKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('TURNSTILE_SECRET_KEY is required in production');
      }
      this.logger.warn('Turnstile secret key is not configured. Skipping verification (dev only).');
      return;
    }

    if (!token) {
      throw new BadRequestException('Turnstile token is missing');
    }

    try {
      const response = await axios.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          secret: secretKey,
          response: token,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data;

      if (!data.success) {
        this.logger.warn(`Turnstile verification failed: ${JSON.stringify(data['error-codes'])}`);
        throw new BadRequestException('Invalid Turnstile token');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error verifying Turnstile token', error);
      throw new BadRequestException('Error verifying Turnstile token');
    }
  }
}
