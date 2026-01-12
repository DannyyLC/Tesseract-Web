import { SetMetadata } from '@nestjs/common';

/**
 * Clave para marcar endpoints que solo usan API Key (no JWT)
 */
export const API_KEY_ONLY = 'apiKeyOnly';

/**
 * Decorador para marcar endpoints que solo aceptan API Key
 * Esto evita que se apliquen los guards JWT de nivel de clase
 *
 * Ejemplo:
 * @Post('execute')
 * @ApiKeyOnly()
 * @UseGuards(ApiKeyGuard)
 * execute(@CurrentApiKey() apiKey: ApiKeyPayload) {
 *   // ...
 * }
 */
export const ApiKeyOnly = () => SetMetadata(API_KEY_ONLY, true);
