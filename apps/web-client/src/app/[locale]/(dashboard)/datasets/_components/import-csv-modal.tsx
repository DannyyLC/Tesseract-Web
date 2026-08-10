'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileUp } from 'lucide-react';
import { DatasetField, DatasetImportResultDto } from '@tesseract/types';
import { Modal } from '@/components/ui/modal';

/**
 * Importación de filas desde CSV.
 *
 * Sin esto, un cliente con trescientos vehículos no adopta la funcionalidad: capturarlos a mano en
 * la rejilla es inviable.
 *
 * El archivo se lee en el navegador y se manda como texto. Así el Gateway no necesita
 * infraestructura de subida de archivos, que hoy no tiene, y de paso podemos enseñar el encabezado
 * detectado antes de mandar nada.
 */

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: DatasetField[];
  onImport: (csv: string) => Promise<DatasetImportResultDto | null>;
}

export function ImportCsvModal({ isOpen, onClose, fields, onImport }: ImportCsvModalProps) {
  const t = useTranslations('Datasets');
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [result, setResult] = useState<DatasetImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setCsv('');
    setFileName('');
    setResult(null);
    setError(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setCsv(await file.text());
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      setResult(await onImport(csv));
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

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('importTitle')} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{t('importDescription')}</p>

        {/* El encabezado puede traer las claves internas o los nombres visibles: pedirle al
            cliente que conozca las claves sería absurdo cuando la UI se las esconde. */}
        <div className="rounded-xl bg-[var(--surface-tint)] p-3">
          <p className="mb-1 text-xs font-medium text-text-secondary">{t('importExpectedHeader')}</p>
          <code className="block overflow-x-auto whitespace-nowrap text-xs text-text-primary">
            {fields.map((field) => field.label).join(',')}
          </code>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-6 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <FileUp size={18} />
          {fileName || t('importChooseFile')}
        </button>

        {error && (
          <div className="bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger-600">{error}</div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success-600">
              {t('importSummary', { imported: result.imported, failed: result.failed })}
            </div>

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
                      <strong className="text-text-primary">{t('importRow', { row: rowError.row })}</strong>{' '}
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
              disabled={!csv || importing}
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
