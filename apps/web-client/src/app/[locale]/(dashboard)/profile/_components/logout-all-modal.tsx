'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { useLogoutAll } from '@/hooks/identity/use-auth';
import { Loader2, MonitorX } from 'lucide-react';
import { toast } from 'sonner';

interface LogoutAllModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LogoutAllModal({ isOpen, onClose }: LogoutAllModalProps) {
  const t = useTranslations('LogoutAllModal');
  const logoutAll = useLogoutAll();

  const handleLogoutAll = async () => {
    try {
      await logoutAll.mutateAsync();
      toast.success(t('successToast'));
      onClose();
    } catch (error: any) {
      toast.error(error.message || t('errorToast'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')}>
      <div className="space-y-4">
        <div className="bg-warning-500/10 rounded-xl p-4 text-warning-500">
          <div className="flex gap-3">
            <MonitorX className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('confirmHeading')}</p>
              <p className="mt-1 text-sm opacity-90">{t('confirmText')}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleLogoutAll}
            disabled={logoutAll.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {logoutAll.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {t('closing')}
              </>
            ) : (
              t('closeButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
