'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Key,
  LogOut,
  User as UserIcon,
  Mail,
  Calendar,
  Building2,
  ShieldCheck,
  MonitorX,
  Globe,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale';
import { useAuth } from '@/hooks/identity/use-auth';
import { useUser } from '@/hooks/identity/use-users';
import { LogoLoader } from '@/components/ui/logo-loader';
import { getRoleConfig } from '@/utils/users.utils';
import Enable2FAModal from './_components/enable-2fa-modal';
import Disable2FAModal from './_components/disable-2fa-modal';
import ChangePasswordModal from './_components/change-password-modal';
import LeaveOrganizationModal from './_components/leave-organization-modal';
import LogoutAllModal from './_components/logout-all-modal';

export default function ProfilePage() {
  const t = useTranslations('Profile');
  const { data: authUser, isLoading: isLoadingAuth } = useAuth();
  const { data: userDetails, isLoading: isLoadingDetails } = useUser(authUser?.sub || '');

  const [isEnable2FAModalOpen, setIsEnable2FAModalOpen] = useState(false);
  const [isDisable2FAModalOpen, setIsDisable2FAModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isLeaveOrgModalOpen, setIsLeaveOrgModalOpen] = useState(false);
  const [isLogoutAllModalOpen, setIsLogoutAllModalOpen] = useState(false);

  const isLoading = isLoadingAuth || isLoadingDetails;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  if (!authUser || !userDetails) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-text-secondary">{t('loadError')}</p>
      </div>
    );
  }

  const roleConfig = getRoleConfig(userDetails.role);
  // Use data from authUser (GET /auth/me) instead of userDetails
  const twoFactorEnabled = authUser.twoFactorEnabled || false;
  const hasPassword = authUser.hasPassword !== false; // Default to true if undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
        <p className="mt-1 text-text-secondary">{t('description')}</p>
      </div>

      {/* Personal Information Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface-panel"
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('personalInfoTitle')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('personalInfoDesc')}</p>
        </div>

        <div className="space-y-4 p-6">
          {/* Name */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <UserIcon size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">{t('nameLabel')}</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">{userDetails.name}</p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Mail size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">{t('emailLabel')}</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">{userDetails.email}</p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Shield size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">{t('roleLabel')}</p>
              <div className="mt-1">
                <span className={`text-sm font-bold uppercase tracking-wide ${roleConfig.color}`}>
                  {roleConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Organization */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Building2 size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">{t('organizationLabel')}</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">
                {authUser.organizationName}
              </p>
            </div>
          </div>

          {/* Member Since */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Calendar size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">{t('memberSinceLabel')}</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">
                {new Date(userDetails.createdAt).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Preferences Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface-panel"
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('preferencesTitle')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('preferencesDesc')}</p>
        </div>

        <div className="space-y-4 p-6">
          {/* Language */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-surface-secondary p-2.5">
                <Globe size={20} className="text-text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('languageLabel')}</p>
                <p className="text-xs text-text-secondary">{t('languageHelper')}</p>
              </div>
            </div>
            <LocaleSwitcher />
          </div>
        </div>
      </motion.div>

      {/* Security Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface-panel"
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('securityTitle')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('securityDesc')}</p>
        </div>

        <div className="space-y-4 p-6">
          {/* 2FA Status */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-lg p-2.5 ${
                  twoFactorEnabled
                    ? 'bg-success-500/10 text-success-500'
                    : 'bg-surface-secondary text-text-secondary'
                }`}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('twoFALabel')}</p>
                <p className="text-xs text-text-secondary">
                  {twoFactorEnabled ? t('twoFAEnabled') : t('twoFADisabled')}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                twoFactorEnabled ? setIsDisable2FAModalOpen(true) : setIsEnable2FAModalOpen(true)
              }
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                twoFactorEnabled
                  ? 'border-danger-500/30 hover:bg-danger-500/10 border text-danger-500'
                  : 'bg-accent text-text-inverse hover:opacity-90'
              }`}
            >
              {twoFactorEnabled ? t('disable') : t('enable')}
            </button>
          </div>

          {/* Change Password */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-surface-secondary p-2.5">
                <Key size={20} className="text-text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {hasPassword ? t('passwordLabel') : t('createPasswordLabel')}
                </p>
                <p className="text-xs text-text-secondary">
                  {hasPassword ? t('passwordHelper') : t('createPasswordHelper')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {hasPassword ? t('changeButton') : t('createButton')}
            </button>
          </div>

          {/* Logout All Sessions */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-surface-secondary p-2.5">
                <MonitorX size={20} className="text-text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('activeSessionsLabel')}</p>
                <p className="text-xs text-text-secondary">{t('activeSessionsHelper')}</p>
              </div>
            </div>
            <button
              onClick={() => setIsLogoutAllModalOpen(true)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-all hover:bg-surface-secondary"
            >
              {t('closeAllButton')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-danger-500/5 overflow-hidden rounded-2xl border border-danger-500"
      >
        <div className="border-b border-danger-500 p-6">
          <h2 className="text-lg font-semibold text-danger-500">{t('dangerZoneTitle')}</h2>
          <p className="text-danger-500/80 mt-1 text-sm">{t('dangerZoneDesc')}</p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between rounded-xl border border-danger-500 bg-surface-panel p-4">
            <div className="flex items-center gap-3">
              <div className="bg-danger-500/10 rounded-lg p-2.5 text-danger-500">
                <LogOut size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{t('leaveOrgLabel')}</p>
                <p className="text-xs text-text-secondary">{t('leaveOrgHelper')}</p>
              </div>
            </div>
            <button
              onClick={() => setIsLeaveOrgModalOpen(true)}
              className="hover:bg-danger-500/10 rounded-xl border border-danger-500 px-4 py-2 text-sm font-medium text-danger-500 transition-all"
            >
              {t('leaveButton')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <Enable2FAModal
        isOpen={isEnable2FAModalOpen}
        onClose={() => setIsEnable2FAModalOpen(false)}
      />
      <Disable2FAModal
        isOpen={isDisable2FAModalOpen}
        onClose={() => setIsDisable2FAModalOpen(false)}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        twoFactorEnabled={twoFactorEnabled}
        hasPassword={hasPassword}
      />
      <LogoutAllModal
        isOpen={isLogoutAllModalOpen}
        onClose={() => setIsLogoutAllModalOpen(false)}
      />
      <LeaveOrganizationModal
        isOpen={isLeaveOrgModalOpen}
        onClose={() => setIsLeaveOrgModalOpen(false)}
        twoFactorEnabled={twoFactorEnabled}
        organizationName={authUser.organizationName}
      />
    </div>
  );
}
