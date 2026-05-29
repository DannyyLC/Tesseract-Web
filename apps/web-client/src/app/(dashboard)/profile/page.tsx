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
} from 'lucide-react';
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
        <p className="text-text-secondary">
          No se pudo cargar la información del usuario
        </p>
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
        <h1 className="text-2xl font-bold text-text-primary">Mi Perfil</h1>
        <p className="mt-1 text-text-secondary">
          Gestiona tu información personal y configuración de seguridad
        </p>
      </div>

      {/* Personal Information Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface-panel"
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary">Información Personal</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Detalles de tu cuenta y organización
          </p>
        </div>

        <div className="space-y-4 p-6">
          {/* Name */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <UserIcon size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">Nombre</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">
                {userDetails.name}
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Mail size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">Email</p>
              <p className="mt-0.5 text-base font-medium text-text-primary">
                {userDetails.email}
              </p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-surface-secondary p-2.5">
              <Shield size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-secondary">Rol</p>
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
              <p className="text-sm font-medium text-text-secondary">Organización</p>
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
              <p className="text-sm font-medium text-text-secondary">Miembro desde</p>
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

      {/* Security Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface-panel"
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary">Seguridad</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Gestiona tu contraseña y autenticación de dos factores
          </p>
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
                <p className="text-sm font-medium text-text-primary">
                  Autenticación de Dos Factores
                </p>
                <p className="text-xs text-text-secondary">
                  {twoFactorEnabled
                    ? 'Tu cuenta está protegida con 2FA'
                    : 'Agrega una capa extra de seguridad'}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                twoFactorEnabled ? setIsDisable2FAModalOpen(true) : setIsEnable2FAModalOpen(true)
              }
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                twoFactorEnabled
                  ? 'border border-danger-500/30 text-danger-500 hover:bg-danger-500/10'
                  : 'bg-accent text-text-inverse hover:opacity-90'
              }`}
            >
              {twoFactorEnabled ? 'Desactivar' : 'Activar'}
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
                  {hasPassword ? 'Contraseña' : 'Crear Contraseña'}
                </p>
                <p className="text-xs text-text-secondary">
                  {hasPassword
                    ? 'Cambia tu contraseña regularmente'
                    : 'Establece una contraseña para tu cuenta'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
            >
              {hasPassword ? 'Cambiar' : 'Crear'}
            </button>
          </div>

          {/* Logout All Sessions */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-surface-secondary p-2.5">
                <MonitorX size={20} className="text-text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Sesiones Activas</p>
                <p className="text-xs text-text-secondary">
                  Cierra sesión en todos los dispositivos
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLogoutAllModalOpen(true)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-all hover:bg-surface-secondary"
            >
              Cerrar todas
            </button>
          </div>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="overflow-hidden rounded-2xl border border-danger-500 bg-danger-500/5"
      >
        <div className="border-b border-danger-500 p-6">
          <h2 className="text-lg font-semibold text-danger-500">Zona Peligrosa</h2>
          <p className="mt-1 text-sm text-danger-500/80">
            Acciones irreversibles que afectan tu cuenta
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between rounded-xl border border-danger-500 bg-surface-panel p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-danger-500/10 p-2.5 text-danger-500">
                <LogOut size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Salir de la Organización
                </p>
                <p className="text-xs text-text-secondary">
                  Perderás acceso a todos los recursos
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLeaveOrgModalOpen(true)}
              className="rounded-xl border border-danger-500 px-4 py-2 text-sm font-medium text-danger-500 transition-all hover:bg-danger-500/10"
            >
              Salir
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
