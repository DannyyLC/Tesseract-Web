import { parseCsv } from './csv.util';

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
