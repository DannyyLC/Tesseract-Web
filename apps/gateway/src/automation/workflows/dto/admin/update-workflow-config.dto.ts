import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkflowConfigDto {
  /**
   * El documento COMPLETO. El editor manda el config entero, no un parche: así todo
   * lo que ningún formulario conoce (post_turn_actions, variable_reducers, claves
   * futuras) viaja intacto en lugar de perderse al guardar.
   *
   * `@IsObject()` deja pasar las propiedades anidadas sin filtrarlas, aunque el
   * ValidationPipe global corra con `forbidNonWhitelisted`.
   */
  @ApiProperty({ description: 'Config completo del workflow' })
  @IsObject()
  @IsNotEmpty({ message: 'El config es requerido' })
  config!: Record<string, any>;

  /**
   * Versión que el editor tenía cargada. Viaja al WHERE del UPDATE para que dos
   * ediciones simultáneas no se pisen: si alguien guardó primero, esto devuelve 409.
   */
  @ApiProperty({ description: 'Versión esperada del workflow (bloqueo optimista)' })
  @IsInt()
  @IsNotEmpty()
  expectedVersion!: number;

  /**
   * Hash del config que el editor cargó. Cierra el hueco que deja el contador de
   * versión: un UPDATE hecho a mano por SQL cambia el config pero NO incrementa
   * `version`, así que el bloqueo por versión no lo detectaría y este guardado
   * pisaría ese cambio en silencio.
   */
  @ApiPropertyOptional({ description: 'sha256 del config que se cargó en el editor' })
  @IsString()
  @IsOptional()
  expectedHash?: string;

  @ApiPropertyOptional({ description: 'Nota del cambio, para el historial' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
