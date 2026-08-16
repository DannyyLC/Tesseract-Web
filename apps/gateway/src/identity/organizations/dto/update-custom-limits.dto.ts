import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Cada campo es tri-estado: ausente = no lo toca, `null` = borra el override (vuelve al
 * default del plan), número = fija el override. `@IsOptional()` deja pasar `null` igual que
 * `undefined` (no corre `@IsInt`/`@Min` en ninguno de los dos casos), y Prisma trata
 * `undefined` como "no actualizar" y `null` como "poner NULL" — así que este DTO no necesita
 * más que declarar el tipo para que el borrado funcione.
 */
export class UpdateCustomLimitsDto {
  @ApiProperty({
    description:
      'Custom maximum number of users allowed in the organization. -1 means unlimited. `null` clears the override back to the plan default. Optional.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(-1) // -1 = ilimitado
  customMaxUsers?: number | null;

  @ApiProperty({
    description:
      'Custom maximum number of workflows allowed in the organization. -1 means unlimited. `null` clears the override back to the plan default. Optional.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxWorkflows?: number | null;

  @ApiProperty({
    description:
      'Custom maximum number of API keys allowed in the organization. -1 means unlimited. `null` clears the override back to the plan default. Optional.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxApiKeys?: number | null;

  @ApiProperty({
    description:
      'Custom maximum number of datasets allowed in the organization. -1 means unlimited. `null` clears the override back to the plan default. Optional.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxDatasets?: number | null;

  @ApiProperty({
    description:
      'Custom maximum number of rows across all datasets in the organization. -1 means unlimited. `null` clears the override back to the plan default. Optional.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxDatasetRows?: number | null;
}
