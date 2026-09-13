import { looksLikeCsvText, parseCsv } from '@tesseract/types';

/**
 * Lo que se revisa del archivo antes de mandarlo.
 *
 * No es adelantarse al servidor por gusto: los cuatro casos que cubre terminan en un 400 el 100%
 * de las veces, así que atraparlos aquí solo ahorra un viaje de ida y vuelta para ver el mismo
 * error. Lo que sí cambia es el mensaje — aquí se puede nombrar el archivo que el usuario eligió.
 */
export type CsvFileProblem =
  | { kind: 'extension'; fileName: string }
  | { kind: 'emptyFile'; fileName: string }
  | { kind: 'emptyContent' }
  | { kind: 'notCsvContent' }
  | { kind: 'noDataRows' };

/** Lo que se sabe del archivo sin abrirlo. */
export function checkCsvFile(file: File): CsvFileProblem | null {
  if (!/\.csv$/i.test(file.name)) {
    return { kind: 'extension', fileName: file.name };
  }

  if (file.size === 0) {
    return { kind: 'emptyFile', fileName: file.name };
  }

  return null;
}

/**
 * Lo que solo se sabe tras leerlo.
 *
 * `looksLikeCsvText` es la misma comprobación que corre el Gateway, así que un `.xlsx` renombrado a
 * `.csv` —que pasa el filtro de extensión— se detiene aquí con el mismo criterio y no con uno
 * parecido.
 */
export function checkCsvContent(text: string): CsvFileProblem | null {
  if (text.trim() === '') {
    return { kind: 'emptyContent' };
  }

  if (!looksLikeCsvText(text)) {
    return { kind: 'notCsvContent' };
  }

  // Misma regla que el Gateway (`rows.length < 2`): encabezado y al menos una fila de datos. Se
  // parsea completo en vez de buscar el primer '\n' porque un encabezado entrecomillado puede
  // traer un salto de línea dentro y el corte caería a media celda.
  if (parseCsv(text).length < 2) {
    return { kind: 'noDataRows' };
  }

  return null;
}
