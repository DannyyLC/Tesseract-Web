'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import Image from 'next/image';
import { useVerify2FA, useAuth } from '@/hooks/useAuth';
import { LogoLoader } from '@/components/ui/logo-loader';

export default function Verify2FAPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const { mutate: verify2FA, isPending, error } = useVerify2FA();
  const { data: user, isLoading: isLoadingUser } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !isLoadingUser) {
      router.push('/dashboard');
    }
  }, [user, isLoadingUser, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      toast.error('El código debe tener 6 dígitos');
      return;
    }

    verify2FA(code, {
      onSuccess: () => {
        toast.success('Verificación exitosa');
        router.push('/dashboard');
      },
      onError: (error: any) => {
        toast.error(error?.message || 'Código inválido. Por favor, intenta nuevamente.');
        setCode('');
      },
    });
  };

  // Show loading while checking authentication
  if (isLoadingUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-black">
        <LogoLoader text="Verificando" />
      </div>
    );
  }

  // If user is authenticated, don't show anything
  if (user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* LEFT SECTION - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#0A0A0A] to-[#1A1A1A] lg:flex lg:w-1/2">
        {/* Dark Mode Base Layer */}
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-black via-[#0A0A0A] to-black dark:block" />

        {/* Seamless Overlay */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden dark:block"
          style={{
            width: '100%',
            background:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0) 50%, #000000 100%)',
          }}
        />

        {/* Animated Background Grid */}
        <div className="z-5 absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>

        {/* Floating Geometric Elements */}
        <div className="absolute left-20 top-20 z-10 h-32 w-32 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border border-white/10" />
        <div className="absolute bottom-32 right-32 z-10 h-24 w-24 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border border-white/5" />
        <div className="absolute left-1/4 top-1/2 z-10 h-16 w-16 rotate-[30deg] animate-pulse rounded-lg border border-white/10" />

        {/* Main Content */}
        <div className="relative z-30 flex w-full flex-col items-center justify-center p-12">
          {/* Logo */}
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
            <h2 className="text-3xl font-semibold leading-tight text-white">
              Seguridad de dos factores
            </h2>
            <p className="text-lg leading-relaxed text-white/60">
              Protege tu cuenta con una capa adicional de seguridad
            </p>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* RIGHT SECTION - FORM */}
      <div className="h-full flex-1 overflow-y-auto bg-white transition-colors duration-300 dark:bg-black">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
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

            {/* Back Button */}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition-colors hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              <ArrowLeft size={16} />
              Volver al login
            </Link>

            {/* Form Container */}
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
                  <Shield className="h-10 w-10 text-black dark:text-white" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">
                  Verificación de dos factores
                </h2>
                <p className="text-sm text-black/60 dark:text-white/60">
                  Ingresa el código de 6 dígitos de tu aplicación de autenticación
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/20 dark:bg-red-900/10 dark:text-red-400">
                    {(error as Error).message || 'Código inválido'}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                    Código de autenticación
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCode(value);
                    }}
                    placeholder="000000"
                    className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-center font-mono text-2xl tracking-widest text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                    required
                    maxLength={6}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Abre tu aplicación de autenticación (Google Authenticator, Authy, etc.)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending || code.length !== 6}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Shield size={20} />
                      Verificar código
                    </>
                  )}
                </button>
              </form>

              <div className="text-center">
                <p className="text-sm text-black/60 dark:text-white/60">
                  ¿Problemas para acceder?{' '}
                  <Link
                    href="/login"
                    className="font-medium text-black hover:underline dark:text-white"
                  >
                    Volver a intentar
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
