import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkflowDto } from './create-workflow.dto';

/**
 * DTO para actualizar un workflow
 *
 * PartialType hace que TODOS los campos de CreateWorkflowDto sean opcionales
 * Esto significa que puedes actualizar solo lo que quieras
 *
 * Ejemplo:
 * - Actualizar solo el nombre: { "name": "Nuevo nombre" }
 * - Actualizar nombre y descripción: { "name": "...", "description": "..." }
 * - Actualizar todo: { ...todos los campos... }
 */
/**
 * Ojo con los tres estados de `timezone`, que son lo que hace funcionar la herencia:
 *
 * - `undefined` → Prisma no toca la columna, así que editar solo el nombre no borra
 *   la zona configurada.
 * - `null` → limpia el override y el workflow vuelve a heredar la de la organización.
 * - string → override explícito.
 *
 * `@IsOptional()` salta la validación con `null` y `undefined`, de modo que el `null`
 * pasa limpio. Una cadena vacía **no**: llegaría a `@IsTimezone()` y daría un 400. Por
 * eso el selector del front manda `null` y nunca `''`.
 */
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}
