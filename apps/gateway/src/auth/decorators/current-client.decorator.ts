import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ClientPayload } from "@/common/types/client-payload.type";

/**
 * Decorador para obtener el cliente autenticado desde el request
 * 
 * Uso:
 * @Post()
 * create(@CurrentClient() client: ClientPayload) {
 *   console.log(client.email);
 * }
 * 
 * Requisito: El endpoint debe estar protegido con ApiKeyGuard
 * para que request.client exista
 */
export const CurrentClient = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): ClientPayload => {
        const request = ctx.switchToHttp().getRequest();
        return request.client;
    },
);