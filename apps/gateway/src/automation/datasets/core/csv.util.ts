/**
 * El parser vive en `@tesseract/types` para que el navegador y el Gateway lean el encabezado con
 * el mismo código: el modal de importación enseña qué columnas reconoció antes de mandar el
 * archivo, y ese aviso solo vale si coincide con lo que después hace `importCsv`.
 *
 * Este archivo se queda como re-export para no tocar los imports de todo el módulo.
 */
export { looksLikeCsvText, matchCsvHeader, parseCsv, parseCsvFirstRow } from '@tesseract/types';
