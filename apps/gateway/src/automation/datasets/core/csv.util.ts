/**
 * Lector de CSV mínimo (RFC 4180) para la importación de filas.
 *
 * Se escribe a mano en vez de sumar una dependencia porque el alcance es diminuto y conocido: el
 * archivo llega como texto en el body —el navegador lo lee con `FileReader`— así que no hace falta
 * ni multer ni streaming. Cubre lo único que un CSV de catálogo trae de verdad: comillas dobles,
 * comas dentro de comillas, comillas escapadas duplicándolas y saltos de línea CRLF o LF.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  // El BOM que antepone Excel se colaría en el nombre de la primera columna y rompería el mapeo.
  const input = text.replace(/^﻿/, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      // Un CRLF avanza dos caracteres pero cierra una sola fila.
      if (char === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  // La última fila puede no terminar en salto de línea.
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  // Descarta las filas totalmente vacías que dejan los editores al final del archivo.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}
