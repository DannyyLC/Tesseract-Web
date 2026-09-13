'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, FileText, FileUp, X } from 'lucide-react';
import {
  CsvHeaderMatch,
  DatasetField,
  DatasetImportResultDto,
  matchCsvHeader,
  parseCsvFirstRow,
} from '@tesseract/types';
import { Modal } from '@/components/ui/modal';
import { checkCsvContent, checkCsvFile, CsvFileProblem } from './csv-file-check';

/**
 * Importación de filas desde CSV.
 *
 * Sin esto, un cliente con trescientos vehículos no adopta la funcionalidad: capturarlos a mano en
 * la rejilla es inviable.
 *
 * El archivo se lee en el navegador y se manda como texto. Así el Gateway no necesita
 * infraestructura de subida de archivos, que hoy no tiene, y de paso podemos revisar el encabezado
 * con el mismo código que después hace el mapeo del lado del servidor: lo que aquí se anuncia como
 * "reconocido" es exactamente lo que allá se va a importar.
 */

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: DatasetField[];
  onImport: (payload: { csv: string; fileName: string }) => Promise<DatasetImportResultDto | null>;
}

export function ImportCsvModal({ isOpen, onClose, fields, onImport }: ImportCsvModalProps) {
  const t = useTranslations('Datasets');
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [problem, setProblem] = useState<CsvFileProblem | null>(null);
  const [headerMatch, setHeaderMatch] = useState<CsvHeaderMatch | null>(null);
  const [result, setResult] = useState<DatasetImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);

  const expectedHeaders = fields.filter((field) => !field.formula);

  const reset = () => {
    setCsv('');
    setFileName('');
    setFileSize(0);
    setProblem(null);
    setHeaderMatch(null);
    setResult(null);
    setError(null);
  };

  /** El mensaje de cada problema, con el nombre real del archivo cuando aplica. */
  const problemMessage = (current: CsvFileProblem): string => {
    switch (current.kind) {
      case 'extension':
        return t('importInvalidExtension', { name: current.fileName });
      case 'emptyFile':
        return t('importEmptyFile', { name: current.fileName });
      case 'emptyContent':
        return t('importEmptyContent');
      case 'notCsvContent':
        return t('importNotCsvContent');
      case 'noDataRows':
        return t('importNoDataRows');
    }
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setFileSize(file.size);

    // La extensión y el tamaño se saben sin abrir el archivo: no hay para qué leerlo.
    const fileProblem = checkCsvFile(file);
    if (fileProblem) {
      setProblem(fileProblem);
      return;
    }

    setReading(true);

    try {
      const text = await file.text();

      const contentProblem = checkCsvContent(text);
      if (contentProblem) {
        setProblem(contentProblem);
        return;
      }

      setCsv(text);
      setHeaderMatch(matchCsvHeader(fields, parseCsvFirstRow(text)));
    } catch {
      setError(t('importFileReadError'));
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      setResult(await onImport({ csv, fileName }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('importError'));
    } finally {
      setImporting(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickFile = () => inputRef.current?.click();

  const disabledReason = problem
    ? problemMessage(problem)
    : !csv && !reading
      ? t('importPickFileFirst')
      : undefined;

  const hasHeaderWarnings =
    !!headerMatch && (headerMatch.unknownHeaders.length > 0 || headerMatch.missingFields.length > 0);

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('importTitle')} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{t('importDescription')}</p>

        {/* El encabezado puede traer las claves internas o los nombres visibles: pedirle al
            cliente que conozca las claves sería absurdo cuando la UI se las esconde.

            Las columnas calculadas no van: su valor sale de la fórmula al importar cada fila, así
            que pedirlas en el archivo sería pedir un dato que se va a descartar. */}
        <div className="rounded-xl bg-[var(--surface-tint)] p-3">
          <p className="mb-1 text-xs font-medium text-text-secondary">{t('importExpectedHeader')}</p>
          <code className="block overflow-x-auto whitespace-nowrap text-xs text-text-primary">
            {expectedHeaders.map((field) => field.label).join(',')}
          </code>
          {fields.some((field) => field.formula) && (
            <p className="mt-2 text-xs text-text-tertiary">{t('importIgnoresCalculated')}</p>
          )}
        </div>

        {/* Que los nombres deban coincidir exactamente es la causa número uno de una importación
            que "funcionó" y dejó una columna entera vacía. Se avisa antes de elegir el archivo, no
            después de fallar. */}
        {!result && (
          <div className="flex items-start gap-2 rounded-xl bg-[var(--badge-warning-bg-solid)] px-4 py-3 text-xs text-[var(--badge-warning-text-solid)]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{t('importHeaderExactWarning')}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            // Sin esto, volver a elegir el mismo archivo tras quitarlo no dispara `change`.
            event.target.value = '';
          }}
        />

        {/* `div` y no `button`: con archivo cargado contiene el botón de quitarlo, y un botón dentro
            de otro no es HTML válido. El `onKeyDown` reemplaza lo que el botón daba gratis. */}
        {!result && (
          <div>
            <div
              role="button"
              tabIndex={0}
              aria-label={t('importChooseOrDrop')}
              onClick={pickFile}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  pickFile();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingOver(true);
              }}
              onDragOver={(event) => {
                // Sin `preventDefault` el navegador abre el archivo y se sale de la aplicación.
                event.preventDefault();
                setDraggingOver(true);
              }}
              onDragLeave={(event) => {
                // Pasar sobre un hijo dispara `dragleave` del padre: sin este guard, parpadea.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDraggingOver(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border py-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                draggingOver
                  ? 'border-accent bg-[var(--surface-tint)] text-text-primary'
                  : fileName && !problem
                    ? 'border-border text-text-primary'
                    : 'border-dashed border-border text-text-secondary hover:border-accent hover:text-text-primary'
              }`}
            >
              {reading ? (
                <>
                  <FileUp size={18} />
                  {t('importReading')}
                </>
              ) : fileName ? (
                <>
                  <FileText size={18} />
                  <span className="flex items-center gap-2">
                    <span className="max-w-[16rem] truncate">{fileName}</span>
                    <button
                      type="button"
                      aria-label={t('importRemoveFile')}
                      title={t('importRemoveFile')}
                      onClick={(event) => {
                        event.stopPropagation();
                        reset();
                      }}
                      className="rounded-full p-1 text-text-tertiary hover:bg-[var(--surface-tint)] hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  </span>
                  {fileSize > 0 && (
                    <span className="text-xs font-normal text-text-tertiary">
                      {(fileSize / 1024).toFixed(1)} KB
                    </span>
                  )}
                </>
              ) : (
                <>
                  <FileUp size={18} />
                  {draggingOver ? t('importDropHere') : t('importChooseOrDrop')}
                  <span className="text-xs font-normal text-text-tertiary">
                    {t('importOnlyCsv')}
                  </span>
                </>
              )}
            </div>

            {/* El botón deshabilitado sin explicación era el reporte: aquí se dice por qué. */}
            {disabledReason && !problem && (
              <p className="mt-2 text-xs text-text-tertiary">{disabledReason}</p>
            )}
          </div>
        )}

        {problem && (
          <div className="rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] px-4 py-3 text-sm text-[var(--danger-text-adaptive)]">
            {problemMessage(problem)}
          </div>
        )}

        {/* El diff se calcula con `matchCsvHeader`, el mismo que corre el Gateway al importar. */}
        {headerMatch && !result && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-text-secondary">{t('importHeaderCheckTitle')}</p>

            {!hasHeaderWarnings ? (
              <p className="flex items-center gap-2 text-xs text-[var(--badge-success-text-solid)]">
                <Check size={14} className="shrink-0" />
                {t('importHeaderAllGood')}
              </p>
            ) : (
              <>
                {headerMatch.recognized.length > 0 && (
                  <HeaderList
                    tone="success"
                    label={t('importHeaderMatched', { count: headerMatch.recognized.length })}
                    items={headerMatch.recognized.map((field) => field.label)}
                  />
                )}
                {headerMatch.unknownHeaders.length > 0 && (
                  <HeaderList
                    tone="warning"
                    label={t('importHeaderUnknown', { count: headerMatch.unknownHeaders.length })}
                    items={headerMatch.unknownHeaders}
                  />
                )}
                {headerMatch.missingFields.length > 0 && (
                  <HeaderList
                    tone="warning"
                    label={t('importHeaderMissing', { count: headerMatch.missingFields.length })}
                    items={headerMatch.missingFields.map((field) => field.label)}
                  />
                )}
                <p className="text-xs text-text-tertiary">{t('importHeaderWarningHint')}</p>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] px-4 py-3 text-sm text-[var(--danger-text-adaptive)]">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="rounded-xl bg-[var(--badge-success-bg-solid)] px-4 py-3 text-sm text-[var(--badge-success-text-solid)]">
              {t('importSummary', { imported: result.imported, failed: result.failed })}
            </div>

            {/* Lo que el servidor ignoró, dicho en voz alta: es la única señal de que una columna
                entera no entró aunque la importación se reporte exitosa. */}
            {result.ignoredColumns && result.ignoredColumns.length > 0 && (
              <div className="rounded-xl bg-[var(--badge-warning-bg-solid)] px-4 py-3 text-xs text-[var(--badge-warning-text-solid)]">
                {t('importIgnoredColumns', { columns: result.ignoredColumns.join(', ') })}
              </div>
            )}

            {/* Las filas malas se reportan con su número de línea en vez de abortar el archivo
                entero por un dato mal escrito en la fila 180. */}
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                {result.errors.map((rowError) => (
                  <div
                    key={rowError.row}
                    className="flex items-start gap-2 border-b border-border px-3 py-2 text-xs text-text-secondary last:border-b-0"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-500" />
                    <span>
                      <strong className="text-text-primary">
                        {t('importRow', { row: rowError.row })}
                      </strong>{' '}
                      {rowError.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
          >
            {result ? t('close') : t('cancel')}
          </button>

          {!result && (
            <button
              onClick={handleImport}
              disabled={!csv || !!problem || importing || reading}
              title={disabledReason}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
            >
              {importing ? t('importing') : t('import')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function HeaderList({
  tone,
  label,
  items,
}: {
  tone: 'success' | 'warning';
  label: string;
  items: string[];
}) {
  const color =
    tone === 'success'
      ? 'text-[var(--badge-success-text-solid)]'
      : 'text-[var(--badge-warning-text-solid)]';

  return (
    <div className="text-xs">
      <p className={`font-medium ${color}`}>{label}</p>
      <p className="mt-0.5 break-words text-text-secondary">{items.join(', ')}</p>
    </div>
  );
}
