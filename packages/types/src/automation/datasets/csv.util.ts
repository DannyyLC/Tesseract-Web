import type { DatasetField } from './datasets';

/**
 * Lectura y mapeo de CSV para la importación de filas.
 *
 * Vive en `@tesseract/types`, y no en el Gateway, porque **el navegador y el servidor tienen que
 * llegar exactamente al mismo resultado**: el modal de importación enseña qué columnas del archivo
 * reconoció antes de mandar nada, y ese aviso solo sirve si es el mismo cálculo que después corre
 * `importCsv`. Con dos implementaciones, un día una diría "columna no reconocida" de una columna
 * que la otra sí acepta, y el aviso pasaría de ayudar a estorbar.
 *
 * El parser se escribe a mano en vez de sumar una dependencia porque el alcance es diminuto y
 * conocido: comillas dobles, comas dentro de comillas, comillas escapadas duplicándolas y saltos de
 * línea CRLF o LF.
 */

/** El BOM que antepone Excel se colaría en el nombre de la primera columna y rompería el mapeo. */
const BOM = /^﻿/;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  const input = text.replace(BOM, '');

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

/**
 * Solo la primera fila con datos, con la misma máquina de estados que `parseCsv`.
 *
 * Existe para que el navegador pueda revisar el encabezado sin recorrer un archivo de cinco mil
 * filas. Partir por `'\n'` no sirve: un campo entrecomillado puede traer un salto de línea dentro y
 * el encabezado saldría cortado a la mitad.
 */
export function parseCsvFirstRow(text: string): string[] {
  const row: string[] = [];
  let value = '';
  let inQuotes = false;

  const input = text.replace(BOM, '');

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
      row.push(value);
      // Una fila totalmente vacía no es el encabezado: `parseCsv` las descarta, así que aquí hay
      // que saltarla igual para no devolver `['']` por un archivo que empieza con un salto suelto.
      if (row.some((cell) => cell.trim() !== '')) {
        return row;
      }
      row.length = 0;
      value = '';
      if (char === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
    } else {
      value += char;
    }
  }

  if (value !== '' || row.length > 0) {
    row.push(value);
  }

  return row.some((cell) => cell.trim() !== '') ? row : [];
}

export interface CsvHeaderMatch {
  /**
   * Posicional: para cada columna del archivo, el campo al que mapea, o `null` si no se reconoce.
   * Es lo que la importación usa para leer cada celda por su índice.
   */
  columns: (DatasetField | null)[];
  /** Campos del catálogo que el archivo sí trae. */
  recognized: DatasetField[];
  /** Encabezados del archivo que no mapean a ninguna columna: se van a ignorar. */
  unknownHeaders: string[];
  /** Columnas capturables del catálogo que el archivo no trae: van a quedar vacías. */
  missingFields: DatasetField[];
}

/**
 * Mapea el encabezado del archivo contra las columnas del catálogo.
 *
 * Dos reglas, las mismas desde que existe la importación:
 *
 * - Las columnas calculadas quedan fuera. Su valor sale de la fórmula al guardar cada fila, así que
 *   pedirlas en el archivo sería pedir un dato que se va a descartar.
 * - El encabezado puede traer la `key` interna o el nombre visible, sin distinguir mayúsculas ni
 *   espacios en el borde. Pedirle al cliente que conozca las keys sería absurdo cuando la UI se las
 *   esconde, y un espacio de más al copiar de Excel no debería costarle una columna.
 *
 * Cualquier otra diferencia —un acento, un plural, una palabra de más— deja la columna sin mapear.
 * Eso no es un descuido: adivinar cuál quiso decir es lo que llevaría a importar precios en la
 * columna equivocada.
 */
export function matchCsvHeader(fields: DatasetField[], header: string[]): CsvHeaderMatch {
  const capturable = fields.filter((field) => !field.formula);

  const byHeader = new Map<string, DatasetField>();
  for (const field of capturable) {
    byHeader.set(field.key.toLowerCase(), field);
    byHeader.set(field.label.toLowerCase(), field);
  }

  const columns = header.map((name) => byHeader.get(name.trim().toLowerCase()) ?? null);

  const recognizedKeys = new Set(
    columns.filter((column): column is DatasetField => column !== null).map((column) => column.key),
  );

  return {
    columns,
    recognized: capturable.filter((field) => recognizedKeys.has(field.key)),
    // Una coma final deja un encabezado vacío que no es una columna mal escrita: no se reporta.
    unknownHeaders: header.filter(
      (name, index) => columns[index] === null && name.trim() !== '',
    ),
    missingFields: capturable.filter((field) => !recognizedKeys.has(field.key)),
  };
}

/**
 * Corta lo que claramente no es texto CSV antes de intentar parsearlo.
 *
 * El Gateway recibe el archivo ya leído como texto, así que un `.xlsx` no llega como binario sino
 * como el mojibake que sale de leer un zip en UTF-8. Sin esta comprobación, ese mojibake recorre
 * toda la importación y termina en "ninguna columna coincide", que manda al usuario a revisar sus
 * encabezados cuando el problema es que guardó el archivo en el formato equivocado.
 *
 * Devuelve `false` para lo que no parece texto plano; el mensaje lo pone quien llama, porque en el
 * Gateway es una excepción HTTP y en el navegador es un aviso dentro del modal.
 */
export function looksLikeCsvText(text: string): boolean {
  // Las firmas viven en los primeros bytes; el resto del archivo no aporta nada a esta decisión.
  const head = text.slice(0, 4096);

  // Zip (xlsx, ods) y PDF, tal como se ven tras leerlos como texto.
  if (/^PK[\x03\x04\x05\x06]/.test(head) || head.startsWith('%PDF-')) {
    return false;
  }

  // Un NUL no aparece en un CSV de verdad ni por accidente.
  if (head.includes('\x00')) {
    return false;
  }

  // Mojibake de binario: mucho carácter de control o de reemplazo. Tab, CR y LF sí son legítimos.
  const suspicious = head.replace(/[\t\r\n]/g, '').match(/[\x00-\x1f\x7f\ufffd]/g);

  return (suspicious?.length ?? 0) / Math.max(head.length, 1) <= 0.02;
}
