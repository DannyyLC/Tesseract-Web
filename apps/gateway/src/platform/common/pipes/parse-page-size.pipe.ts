import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';

/**
 * Valida `?pageSize=` de los listados por cursor.
 *
 * Antes cada controlador usaba `DefaultValuePipe + ParseIntPipe`, que acepta `0`, negativos y
 * `100000`: un valor así convierte el listado en un volcado de la tabla o rompe el `take` con signo
 * que usa la paginación hacia atrás. Aquí solo pasa un entero entre 1 y `MAX_PAGE_SIZE`; omitido,
 * se usa `DEFAULT_PAGE_SIZE`.
 */
@Injectable()
export class ParsePageSizePipe implements PipeTransform<string | undefined, number> {
  transform(value: string | undefined): number {
    if (value === undefined || value === '') return DEFAULT_PAGE_SIZE;

    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('pageSize debe ser un entero positivo');
    }

    const size = Number(value);
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw new BadRequestException(`pageSize debe estar entre 1 y ${MAX_PAGE_SIZE}`);
    }
    return size;
  }
}
