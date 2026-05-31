'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter, Link } from '@/i18n/routing';
import Image from 'next/image';
import { useVerify2FA, useAuth } from '@/hooks/identity/use-auth';
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
      <div className="flex h-screen items-center justify-center bg-surface">
        <LogoLoader text="Verificando" />
      </div>
    );
  }

  // If user is authenticated, don't show anything
  if (user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-black">
      {/* LEFT SECTION - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-gradient-start via-gradient-mid to-gradient-end lg:flex lg:w-1/2">
        {/* Dark Mode Base Layer */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-brand-black via-brand-black to-brand-black" />

        {/* Seamless Overlay */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20"
          style={{
            width: '100%',
            opacity: 'var(--auth-branding-seam-opacity)',
            background:
              'linear-gradient(to right, transparent 0%, transparent 50%, var(--gradient-start) 100%)',
          }}
        />

        {/* Animated Background Grid */}
        <div className="z-5 absolute inset-0" style={{ opacity: 'var(--auth-branding-grid-opacity)' }}>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>

        {/* Floating Geometric Elements */}
        <div className="absolute left-20 top-20 z-10 h-32 w-32 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border)' }} />
        <div className="absolute bottom-32 right-32 z-10 h-24 w-24 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border-faint)' }} />
        <div className="absolute left-1/4 top-1/2 z-10 h-16 w-16 rotate-[30deg] animate-pulse rounded-lg border" style={{ borderColor: 'var(--auth-branding-float-border)' }} />

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
            <h2 className="text-3xl font-semibold leading-tight text-brand-white">
              Seguridad de dos factores
            </h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--auth-branding-text-desc)' }}>
              Protege tu cuenta con una capa adicional de seguridad
            </p>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* RIGHT SECTION - FORM */}
      <div className="h-full flex-1 overflow-y-auto bg-auth-form-bg transition-colors duration-300">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
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

            {/* Back Button */}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-text-primary"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} />
              Volver al login
            </Link>

            {/* Form Container */}
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-secondary">
                  <Shield className="h-10 w-10 text-text-primary" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-text-primary">
                  Verificación de dos factores
                </h2>
                <p className="text-sm text-text-secondary">
                  Ingresa el código de 6 dígitos de tu aplicación de autenticación
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-600">
                    {(error as Error).message || 'Código inválido'}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
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
                    className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 text-center font-mono text-2xl tracking-widest outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                    required
                    maxLength={6}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs text-text-secondary">
                    Abre tu aplicación de autenticación (Google Authenticator, Authy, etc.)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending || code.length !== 6}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
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
                <p className="text-sm text-text-secondary">
                  ¿Problemas para acceder?{' '}
                  <Link
                    href="/login"
                    className="font-medium text-accent hover:underline"
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
