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
import { useAuth } from '@/hooks/useAuth';
import { useUser } from '@/hooks/useUsers';
import { LogoLoader } from '@/components/ui/logo-loader';
import { getRoleConfig } from '@/app/_shared/_utils/users.utils';
import Enable2FAModal from './_components/Enable2FAModal';
import Disable2FAModal from './_components/Disable2FAModal';
import ChangePasswordModal from './_components/ChangePasswordModal';
import LeaveOrganizationModal from './_components/LeaveOrganizationModal';
import LogoutAllModal from './_components/LogoutAllModal';

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
        <p className="text-black/50 dark:text-white/50">
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
        <h1 className="text-2xl font-bold text-black dark:text-white">Mi Perfil</h1>
        <p className="mt-1 text-black/50 dark:text-white/50">
          Gestiona tu información personal y configuración de seguridad
        </p>
      </div>

      {/* Personal Information Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#141414]"
      >
        <div className="border-b border-black/5 p-6 dark:border-white/5">
          <h2 className="text-lg font-semibold text-black dark:text-white">Información Personal</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Detalles de tu cuenta y organización
          </p>
        </div>

        <div className="space-y-4 p-6">
          {/* Name */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
              <UserIcon size={20} className="text-black/60 dark:text-white/60" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Nombre</p>
              <p className="mt-0.5 text-base font-medium text-black dark:text-white">
                {userDetails.name}
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
              <Mail size={20} className="text-black/60 dark:text-white/60" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Email</p>
              <p className="mt-0.5 text-base font-medium text-black dark:text-white">
                {userDetails.email}
              </p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
              <Shield size={20} className="text-black/60 dark:text-white/60" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Rol</p>
              <div className="mt-1">
                <span className={`text-sm font-bold uppercase tracking-wide ${roleConfig.color}`}>
                  {roleConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Organization */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
              <Building2 size={20} className="text-black/60 dark:text-white/60" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Organización</p>
              <p className="mt-0.5 text-base font-medium text-black dark:text-white">
                {authUser.organizationName}
              </p>
            </div>
          </div>

          {/* Member Since */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
              <Calendar size={20} className="text-black/60 dark:text-white/60" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Miembro desde</p>
              <p className="mt-0.5 text-base font-medium text-black dark:text-white">
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
        className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-[#141414]"
      >
        <div className="border-b border-black/5 p-6 dark:border-white/5">
          <h2 className="text-lg font-semibold text-black dark:text-white">Seguridad</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Gestiona tu contraseña y autenticación de dos factores
          </p>
        </div>

        <div className="space-y-4 p-6">
          {/* 2FA Status */}
          <div className="flex items-center justify-between rounded-xl border border-black/5 p-4 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-lg p-2.5 ${
                  twoFactorEnabled
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'
                }`}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  Autenticación de Dos Factores
                </p>
                <p className="text-xs text-black/50 dark:text-white/50">
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
                  ? 'border border-red-500/20 text-red-600 hover:bg-red-500/10 dark:text-red-400'
                  : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
              }`}
            >
              {twoFactorEnabled ? 'Desactivar' : 'Activar'}
            </button>
          </div>

          {/* Change Password */}
          <div className="flex items-center justify-between rounded-xl border border-black/5 p-4 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
                <Key size={20} className="text-black/60 dark:text-white/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  {hasPassword ? 'Contraseña' : 'Crear Contraseña'}
                </p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {hasPassword
                    ? 'Cambia tu contraseña regularmente'
                    : 'Establece una contraseña para tu cuenta'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
            >
              {hasPassword ? 'Cambiar' : 'Crear'}
            </button>
          </div>

          {/* Logout All Sessions */}
          <div className="flex items-center justify-between rounded-xl border border-black/5 p-4 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-black/5 p-2.5 dark:bg-white/5">
                <MonitorX size={20} className="text-black/60 dark:text-white/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">Sesiones Activas</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Cierra sesión en todos los dispositivos
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLogoutAllModalOpen(true)}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-black transition-all hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
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
        className="overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/5 dark:bg-red-500/10"
      >
        <div className="border-b border-red-500/20 p-6">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Zona Peligrosa</h2>
          <p className="mt-1 text-sm text-red-600/70 dark:text-red-400/70">
            Acciones irreversibles que afectan tu cuenta
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-white p-4 dark:bg-[#141414]">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-500/10 p-2.5 text-red-500">
                <LogOut size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  Salir de la Organización
                </p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Perderás acceso a todos los recursos
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLeaveOrgModalOpen(true)}
              className="rounded-xl border border-red-500/20 px-4 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-500/10 dark:text-red-400"
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
