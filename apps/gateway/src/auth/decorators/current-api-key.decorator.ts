import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyPayload } from '../../common/types/api-key-payload.type';

/**
 * Decorador para obtener la API Key autenticada
 * 
 * Uso:
 * @Post('execute')
 * @UseGuards(ApiKeyGuard)
 * execute(@CurrentApiKey() apiKey: ApiKeyPayload) {
 *   console.log(apiKey.apiKeyName);     // "Production Web"
 *   console.log(apiKey.organizationId); // ID de la organización
 * }
 * 
 * Requisito: El endpoint debe estar protegido con ApiKeyGuard
 * para que request.apiKey exista
 */
export const CurrentApiKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ApiKeyPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKey;
  },
);
