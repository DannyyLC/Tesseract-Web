import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { resolveLocale, SupportedLocale } from '@/platform/common/types/locale.type';

/**
 * Locale de la request actual: header `X-Locale` (lo manda el front en cada llamada, ver
 * `api-request-manager.ts`), con fallback al query param `locale` para no romper llamadas
 * viejas (ej. enlaces de email ya enviados) y default `es`.
 *
 * Uso:
 * @Get()
 * find(@Locale() locale: SupportedLocale) { }
 */
export const Locale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupportedLocale => {
    const request = ctx.switchToHttp().getRequest();
    const header = request.headers?.['x-locale'];
    const query = request.query?.locale;
    return resolveLocale(header ?? query);
  },
);
