'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganizationMutations } from '@/hooks/identity/use-organizations';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Loader2, Mail, Send } from 'lucide-react';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteUserModal({ isOpen, onClose }: InviteUserModalProps) {
  const t = useTranslations('InviteUserModal');
  const [email, setEmail] = useState('');
  const { inviteUser } = useOrganizationMutations();

  const getErrorMessage = (error: any): string => {
    const raw: string =
      error?.response?.data?.errors?.[0] || error?.response?.data?.message || error?.message || '';

    const messages: Record<string, string> = {
      USER_ALREADY_REGISTERED: t('errorAlreadyMember'),
      USER_ALREADY_INVITED: t('errorAlreadyInvited'),
      EMAIL_IN_SINUP_PROGRESS: t('errorSignupInProgress'),
      INVITE_LIMIT_EXCEEDED: t('errorInviteLimit'),
      ORGANIZATION_NOT_FOUND: t('errorOrgNotFound'),
      ORGANIZATION_NOT_VALID: t('errorOrgNotValid'),
      ERROR_SENDING_EMAIL: t('errorSendingEmail'),
      ERROR_CREATING_RECORD: t('errorCreatingRecord'),
      'Formato de correo electrónico inválido': t('errorInvalidEmail'),
    };

    return messages[raw] ?? (raw || t('defaultError'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error(t('emailRequired'));
      return;
    }

    try {
      await inviteUser.mutateAsync({ email });
      toast.success(t('successToast'));
      setEmail('');
      onClose();
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">{t('emailLabel')}</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
              <Mail size={18} />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="focus:ring-border-focus/5 w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-4 text-sm text-text-primary outline-none focus:border-border-hover focus:ring-4"
              autoFocus
              required
            />
          </div>
          <p className="text-xs text-text-secondary">{t('emailHelper')}</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            type="submit"
            disabled={inviteUser.isPending || !email.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {inviteUser.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {t('sending')}
              </>
            ) : (
              <>
                <Send size={18} />
                {t('sendButton')}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
