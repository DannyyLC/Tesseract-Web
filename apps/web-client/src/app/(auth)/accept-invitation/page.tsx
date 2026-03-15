'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAcceptInvitation } from '@/hooks/useOrganizations';
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
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Error al aceptar la invitación');
    }
  };

  if (!code) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <Building2 className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Invitación inválida</h2>
        <p className="text-black/60 dark:text-white/60">
          El enlace de invitación no es válido o ha expirado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white">
          Aceptar Invitación
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Completa tus datos para unirte a la organización
          {email && (
            <span className="mt-1 block font-medium text-black dark:text-white">{email}</span>
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Nombre Completo
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Contraseña
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 pr-12 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 transition-colors hover:text-black dark:text-white/40 dark:hover:text-white"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
            Confirmar Contraseña
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 pr-12 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 transition-colors hover:text-black dark:text-white/40 dark:hover:text-white"
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={acceptInvitation.isPending}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-black dark:hover:bg-white/90"
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
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SECCIÓN IZQUIERDA - BRANDING (Reutilizado de AuthScreen) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#0A0A0A] to-[#1A1A1A] lg:flex lg:w-1/2">
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-black via-[#0A0A0A] to-black dark:block" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden dark:block"
          style={{
            width: '100%',
            background:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0) 50%, #000000 100%)',
          }}
        />
        <div className="z-5 absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>

        <div className="absolute left-20 top-20 z-10 h-32 w-32 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border border-white/10" />
        <div className="absolute bottom-32 right-32 z-10 h-24 w-24 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border border-white/5" />
        <div className="absolute left-1/4 top-1/2 z-10 h-16 w-16 rotate-[30deg] animate-pulse rounded-lg border border-white/10" />

        <div className="relative z-30 flex w-full flex-col items-center justify-center p-12">
          <div className="mb-16 flex items-center gap-4">
            <div className="group relative">
              <div className="relative h-32 w-32">
                <Image
                  src="/favicon.svg"
                  alt="Tesseract Logo"
                  fill
                  className="object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-transform duration-500 group-hover:scale-110 [@media(prefers-color-scheme:light)]:invert"
                />
              </div>
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-white">Tesseract</h1>
              <p className="mt-1 text-sm uppercase tracking-widest text-white/40">
                Automation Platform
              </p>
            </div>
          </div>

          <div className="max-w-lg space-y-4 text-center">
            <h2 className="text-3xl font-semibold leading-tight text-white">Únete a tu equipo</h2>
            <p className="text-lg leading-relaxed text-white/60">
              Colabora y automatiza flujos de trabajo en conjunto
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-white transition-colors duration-300 dark:bg-black">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          {/* Mobile Logo */}
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-black dark:bg-white">
              <Image
                src="/favicon.svg"
                alt="Tesseract Logo"
                width={32}
                height={32}
                className="h-28 w-28 object-contain invert"
              />
            </div>
            <span className="text-xl font-bold text-black dark:text-white">Tesseract</span>
          </div>

          <Suspense fallback={<LogoLoader text="Cargando..." />}>
            <AcceptInvitationForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
