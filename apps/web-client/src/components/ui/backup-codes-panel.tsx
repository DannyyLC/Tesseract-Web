'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Download } from 'lucide-react';
import { CopyButton } from './copy-button';

interface BackupCodesPanelProps {
  codes: string[];
}

/**
 * Muestra los códigos de respaldo recién emitidos.
 *
 * Solo se ven una vez —el servidor guarda únicamente su hash—, de ahí el aviso
 * y las dos vías para conservarlos: copiar y descargar.
 */
export const BackupCodesPanel = ({ codes }: BackupCodesPanelProps) => {
  const t = useTranslations('BackupCodes');

  const asPlainText = [
    t('fileHeading'),
    '',
    ...codes.map((code) => `  ${code}`),
    '',
    t('fileFooter'),
  ].join('\n');

  const handleDownload = () => {
    const blob = new Blob([asPlainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tesseract-backup-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl bg-warning-500/10 p-4 text-warning-500">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">{t('warningHeading')}</p>
          <p className="mt-1 text-sm opacity-90">{t('warningText')}</p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-secondary p-4">
        {codes.map((code) => (
          <li
            key={code}
            className="text-center font-mono text-sm tracking-wider text-text-primary"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
        <CopyButton
          text={asPlainText}
          label={t('copyAll')}
          copiedLabel={t('copied')}
          successMessage={t('copiedToast')}
          size={16}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
        />
        <button
          type="button"
          onClick={handleDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
        >
          <Download size={16} />
          <span className="text-xs font-medium">{t('download')}</span>
        </button>
      </div>
    </div>
  );
};
