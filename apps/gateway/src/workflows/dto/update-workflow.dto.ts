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
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}
