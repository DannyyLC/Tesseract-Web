'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useAcceptInvitation } from '@/hooks/identity/use-organizations';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Building2, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { LogoLoader } from '@/components/ui/logo-loader';

function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const acceptInvitation = useAcceptInvitation();

  const code = searchParams.get('code');
  const email = searchParams.get('email');

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!code) {
      toast.error('Código de invitación inválido o faltante');
      // Redirigir o mostrar estado de error
    }
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code) {
      toast.error('No se ha proporcionado un código de invitación válido');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      await acceptInvitation.mutateAsync({
        user: fullName,
        password,
        verificationCode: code,
      });
      toast.success('Invitación aceptada exitosamente. Por favor, inicia sesión.');
      router.push('/login?welcome=true');
    } catch (error: any) {
      toast.error(error.message || 'Error al aceptar la invitación');
    }
  };

  if (!code) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div className="rounded-full p-3" style={{ background: 'var(--danger-surface)', color: 'var(--danger-text-adaptive)' }}>
          <Building2 className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Invitación inválida</h2>
        <p className="text-text-secondary">
          El enlace de invitación no es válido o ha expirado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">
          Aceptar Invitación
        </h2>
        <p className="text-sm text-text-secondary">
          Completa tus datos para unirte a la organización
          {email && (
            <span className="mt-1 block font-medium text-text-primary">{email}</span>
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Nombre Completo
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Contraseña
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 pr-12 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-primary"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Confirmar Contraseña
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 pr-12 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-primary"
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={acceptInvitation.isPending}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
      >
        {acceptInvitation.isPending ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Procesando...
          </>
        ) : (
          <>
            Aceptar Invitación
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>
    </form>
  );
}

export default function AcceptInvitationPage() {
  return (
    // Contenedor principal: bloquea el scroll global
    <div className="flex h-screen overflow-hidden bg-brand-black">
      {/* SECCIÓN IZQUIERDA - BRANDING (Reutilizado de AuthScreen) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-gradient-start via-gradient-mid to-gradient-end lg:flex lg:w-1/2">
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-brand-black via-brand-black to-brand-black" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20"
          style={{
            width: '100%',
            opacity: 'var(--auth-branding-seam-opacity)',
            background:
              'linear-gradient(to right, transparent 0%, transparent 50%, var(--gradient-start) 100%)',
          }}
        />
        <div className="z-5 absolute inset-0" style={{ opacity: 'var(--auth-branding-grid-opacity)' }}>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>

        <div className="absolute left-20 top-20 z-10 h-32 w-32 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border)' }} />
        <div className="absolute bottom-32 right-32 z-10 h-24 w-24 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border-faint)' }} />
        <div className="absolute left-1/4 top-1/2 z-10 h-16 w-16 rotate-[30deg] animate-pulse rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border)' }} />

        <div className="relative z-30 flex w-full flex-col items-center justify-center p-12">
          <div className="mb-16 flex items-center gap-4">
            <div className="group relative">
              <div className="relative h-32 w-32">
                <Image
                  src="/favicon.svg"
                  alt="Tesseract Logo"
                  fill
                  className="object-contain transition-transform duration-500 group-hover:scale-110"
                  style={{ filter: 'var(--auth-branding-logo-filter)' }}
                />
              </div>
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-brand-white">Tesseract</h1>
              <p className="mt-1 text-sm uppercase tracking-widest" style={{ color: 'var(--auth-branding-text-label)' }}>
                Automation Platform
              </p>
            </div>
          </div>

          <div className="max-w-lg space-y-4 text-center">
            <h2 className="text-3xl font-semibold leading-tight text-brand-white">Únete a tu equipo</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--auth-branding-text-desc)' }}>
              Colabora y automatiza flujos de trabajo en conjunto
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-auth-form-bg transition-colors duration-300">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          {/* Mobile Logo */}
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent">
              <Image
                src="/favicon.svg"
                alt="Tesseract Logo"
                width={32}
                height={32}
                className="h-28 w-28 object-contain invert"
              />
            </div>
            <span className="text-xl font-bold text-text-primary">Tesseract</span>
          </div>

          <Suspense fallback={<LogoLoader text="Cargando..." />}>
            <AcceptInvitationForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
