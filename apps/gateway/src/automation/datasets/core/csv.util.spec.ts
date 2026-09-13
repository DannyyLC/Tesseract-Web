import { DatasetField } from '@tesseract/types';
import { looksLikeCsvText, matchCsvHeader, parseCsv, parseCsvFirstRow } from './csv.util';

describe('parseCsv', () => {
  it('lee un archivo simple', () => {
    expect(parseCsv('marca,precio\nToyota,320000\nFord,280000')).toEqual([
      ['marca', 'precio'],
      ['Toyota', '320000'],
      ['Ford', '280000'],
    ]);
  });

  it('respeta las comas dentro de comillas', () => {
    expect(parseCsv('nombre,precio\n"Land Cruiser, blindado",320000')).toEqual([
      ['nombre', 'precio'],
      ['Land Cruiser, blindado', '320000'],
    ]);
  });

  it('interpreta las comillas escapadas por duplicación', () => {
    expect(parseCsv('nota\n"Mide 5"" de ancho"')).toEqual([['nota'], ['Mide 5" de ancho']]);
  });

  it('acepta CRLF sin dejar filas vacías', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('quita el BOM que antepone Excel', () => {
    // Sin esto, el nombre de la primera columna llevaría un carácter invisible y el mapeo fallaría.
    expect(parseCsv('﻿marca,precio\nToyota,1')[0]).toEqual(['marca', 'precio']);
  });

  it('descarta las filas totalmente vacías del final', () => {
    expect(parseCsv('a\n1\n\n\n')).toEqual([['a'], ['1']]);
  });

  it('conserva un salto de línea dentro de comillas', () => {
    expect(parseCsv('desc\n"linea1\nlinea2"')).toEqual([['desc'], ['linea1\nlinea2']]);
  });
});

/**
 * El navegador lee solo el encabezado para avisar qué columnas reconoció antes de subir el archivo.
 * Ese atajo sirve mientras dé exactamente lo mismo que la primera fila del parser completo: si un
 * día divergen, el aviso empieza a mentir sobre lo que el servidor va a hacer.
 */
describe('parseCsvFirstRow', () => {
  const casos: [string, string][] = [
    ['archivo simple', 'marca,precio\nToyota,320000'],
    ['BOM de Excel', '﻿marca,precio\nToyota,1'],
    ['CRLF', 'a,b\r\n1,2\r\n'],
    ['coma dentro de comillas', '"Land Cruiser, blindado",320000\nx,y'],
    ['salto de línea dentro de comillas', '"linea1\nlinea2",b\n1,2'],
    ['comillas escapadas', '"Mide 5"" de ancho",b\n1,2'],
    ['saltos sueltos al inicio', '\n\nmarca,precio\nToyota,1'],
    ['sin salto final', 'marca,precio'],
  ];

  it.each(casos)('coincide con parseCsv()[0]: %s', (_nombre, texto) => {
    expect(parseCsvFirstRow(texto)).toEqual(parseCsv(texto)[0]);
  });

  it('devuelve vacío cuando no hay contenido', () => {
    expect(parseCsvFirstRow('')).toEqual([]);
    expect(parseCsvFirstRow('\n\n')).toEqual([]);
  });
});

describe('matchCsvHeader', () => {
  const campo = (key: string, label: string, formula?: string): DatasetField => ({
    key,
    label,
    type: 'number',
    order: 0,
    ...(formula ? { formula } : {}),
  });

  const FIELDS = [
    campo('precio_base', 'Precio base'),
    campo('porcentaje', 'Porcentaje'),
    campo('precio_final', 'Precio final', 'precio_base * 2'),
  ];

  it('acepta la key o el nombre visible, sin distinguir mayúsculas ni espacios en el borde', () => {
    const match = matchCsvHeader(FIELDS, ['  PRECIO_BASE ', 'Porcentaje']);

    expect(match.recognized.map((field) => field.key)).toEqual(['precio_base', 'porcentaje']);
    expect(match.unknownHeaders).toEqual([]);
    expect(match.missingFields).toEqual([]);
  });

  it('deja fuera las columnas calculadas: no se capturan ni se echan de menos', () => {
    const match = matchCsvHeader(FIELDS, ['precio_base', 'porcentaje', 'precio_final']);

    expect(match.unknownHeaders).toEqual(['precio_final']);
    expect(match.missingFields).toEqual([]);
  });

  it('reporta lo que no coincide y lo que falta, en vez de adivinar', () => {
    // "Precio-base" se parece al label "Precio base", pero un guion no es un espacio: adivinar cuál
    // quiso decir es lo que llevaría a importar precios en la columna equivocada.
    const match = matchCsvHeader(FIELDS, ['Precio-base', 'Descuento']);

    expect(match.recognized).toEqual([]);
    expect(match.unknownHeaders).toEqual(['Precio-base', 'Descuento']);
    expect(match.missingFields.map((field) => field.key)).toEqual(['precio_base', 'porcentaje']);
  });

  it('no cuenta como columna mal escrita el hueco que deja una coma final', () => {
    const match = matchCsvHeader(FIELDS, ['precio_base', 'porcentaje', '']);

    expect(match.unknownHeaders).toEqual([]);
  });

  it('conserva la posición de cada columna, incluidas las que no mapean', () => {
    const match = matchCsvHeader(FIELDS, ['ruido', 'precio_base']);

    expect(match.columns[0]).toBeNull();
    expect(match.columns[1]?.key).toBe('precio_base');
  });
});

describe('looksLikeCsvText', () => {
  it('acepta un CSV normal, con acentos y comillas', () => {
    expect(looksLikeCsvText('marca,año\nCitroën,2024\n"con, coma",1')).toBe(true);
  });

  it('rechaza un xlsx u ods leído como texto', () => {
    expect(looksLikeCsvText('PK\x03\x04\x14\x00\x08\x00')).toBe(false);
  });

  it('rechaza un PDF', () => {
    expect(looksLikeCsvText('%PDF-1.7\n%âãÏÓ')).toBe(false);
  });

  it('rechaza binario con NUL', () => {
    expect(looksLikeCsvText('marca\x00precio')).toBe(false);
  });

  it('acepta un archivo vacío: de eso se queja quien valida el contenido', () => {
    expect(looksLikeCsvText('')).toBe(true);
  });
});
