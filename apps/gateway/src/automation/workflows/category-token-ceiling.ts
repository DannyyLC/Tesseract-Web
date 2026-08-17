/**
 * Valida el `maxTokensPerExecution` de un workflow contra el techo de su categoría.
 *
 * El techo ya estaba declarado en `WORKFLOW_CATEGORIES` desde el principio, pero
 * `getWorkflowMaxTokens()` no se llamaba desde ningún lado: se podía crear un workflow
 * LIGHT con 500k y nadie lo impedía. Esta es la pieza que faltaba.
 *
 * Importa más de lo que parece. Mientras no exista una guarda contra la ventana de
 * contexto del modelo, este techo es la ÚNICA protección: `ADVANCED` está por debajo de
 * los 400k de `gpt-5.4-mini`, el modelo más chico en uso, así que respetarlo es lo que
 * evita que un historial no le quepa al modelo y el error salga del proveedor, en
 * producción y a media conversación.
 */

import { BadRequestException } from '@nestjs/common';
import { WorkflowCategory, getWorkflowMaxTokens } from '@tesseract/types';

export interface CategoryTokenPair {
  category: WorkflowCategory;
  maxTokensPerExecution: number;
}

/**
 * Lanza `BadRequestException` si el par (categoría, tokens) se pasa del techo.
 *
 * Recibe el par YA RESUELTO a propósito. En una edición, `category` y
 * `maxTokensPerExecution` viajan por separado y ambos son opcionales: validar el DTO
 * crudo dejaría pasar bajar la categoría sin tocar los tokens, que es la misma
 * violación por la puerta de atrás. Quien llama resuelve cada campo contra lo que ya
 * está guardado y pasa el par completo.
 */
export function assertMaxTokensWithinCategory({
  category,
  maxTokensPerExecution,
}: CategoryTokenPair): void {
  const ceiling = getWorkflowMaxTokens(category);

  if (maxTokensPerExecution > ceiling) {
    throw new BadRequestException(
      `maxTokensPerExecution (${maxTokensPerExecution}) supera el máximo de la categoría ` +
        `${category} (${ceiling}). Baja el valor o sube la categoría del workflow.`,
    );
  }
}

/**
 * ¿Esta edición puede sacar al workflow de rango?
 *
 * Solo si toca alguno de los dos campos. Sin esto, una fila vieja que ya estuviera por
 * encima del techo quedaría imposible de editar —ni para cambiarle el nombre— por un
 * límite que se agregó después. Cerrar el hueco no debería trabar lo que ya existe.
 */
export function touchesCategoryCeiling(dto: {
  category?: unknown;
  maxTokensPerExecution?: unknown;
}): boolean {
  return dto.category !== undefined || dto.maxTokensPerExecution !== undefined;
}
