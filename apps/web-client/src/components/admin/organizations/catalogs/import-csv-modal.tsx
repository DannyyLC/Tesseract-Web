'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, FileUp } from 'lucide-react';
import { DatasetField, DatasetImportResultDto } from '@tesseract/types';
import { Modal } from '@/components/ui/modal';
import { btnGhost, btnPrimary } from '@/app/[locale]/admin/_styles';

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: DatasetField[];
  onImport: (csv: string) => Promise<DatasetImportResultDto | null>;
}

/** Clon admin de `(dashboard)/datasets/_components/import-csv-modal.tsx`. */
export function ImportCsvModal({ isOpen, onClose, fields, onImport }: ImportCsvModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
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
      setError(caught instanceof Error ? caught.message : 'No se pudo importar el archivo');
    } finally {
      setImporting(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Importar CSV" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          El encabezado puede usar las claves o los nombres visibles de las columnas.
        </p>

        <div className="rounded-lg bg-surface-secondary p-3">
          <p className="mb-1 text-xs font-medium text-text-secondary">Encabezado esperado:</p>
          <code className="block overflow-x-auto whitespace-nowrap text-xs text-text-primary">
            {fields
              .filter((field) => !field.formula)
              .map((field) => field.label)
              .join(',')}
          </code>
          {fields.some((field) => field.formula) && (
            <p className="mt-2 text-xs text-text-tertiary">Las columnas calculadas se ignoran al importar.</p>
          )}
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary"
        >
          <FileUp size={18} />
          {fileName || 'Elegir archivo'}
        </button>

        {error && <div className="bg-danger/10 rounded-lg px-4 py-3 text-sm text-danger-600">{error}</div>}

        {result && (
          <div className="space-y-2">
            <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600">
              Se importaron {result.imported} filas y se rechazaron {result.failed}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {result.errors.map((rowError) => (
                  <div
                    key={rowError.row}
                    className="flex items-start gap-2 border-b border-border px-3 py-2 text-xs text-text-secondary last:border-b-0"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-500" />
                    <span>
                      <strong className="text-text-primary">Fila {rowError.row}:</strong> {rowError.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={close}>
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result && (
            <button className={btnPrimary} onClick={handleImport} disabled={!csv || importing}>
              {importing ? 'Importando…' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
