'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/routing';
import { useResetPasswordStepOne } from '@/hooks/identity/use-auth';
import { Turnstile } from '@marsidev/react-turnstile';

export default function ForgotPasswordScreen() {
  const t = useTranslations('ForgotPasswordScreen');
  const router = useRouter();
  const { mutateAsync: sendResetCode, isPending } = useResetPasswordStepOne();

  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !turnstileToken) return;

    try {
      await sendResetCode({ email, turnstileToken });
      toast.success(t('successToast'));
      router.push('/reset-password');
    } catch (error: any) {
      toast.error(error.message || t('errorToast'));
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-black">
      {/* SECCIÓN IZQUIERDA - BRANDING */}
      <div className="from-gradient-start via-gradient-mid to-gradient-end relative hidden overflow-hidden bg-gradient-to-br lg:flex lg:w-1/2">
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
        <div
          className="z-5 absolute inset-0"
          style={{ opacity: 'var(--auth-branding-grid-opacity)' }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>

        {/* Floating Geometric Elements */}
        <div
          className="absolute left-20 top-20 z-10 h-32 w-32 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border"
          style={{ borderColor: 'var(--auth-branding-float-border)' }}
        />
        <div
          className="absolute bottom-32 right-32 z-10 h-24 w-24 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border"
          style={{ borderColor: 'var(--auth-branding-float-border-faint)' }}
        />
        <div
          className="absolute left-1/4 top-1/2 z-10 h-16 w-16 rotate-[30deg] animate-pulse rounded-lg border"
          style={{ borderColor: 'var(--auth-branding-float-border)' }}
        />

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
              <p
                className="mt-1 text-sm uppercase tracking-widest"
                style={{ color: 'var(--auth-branding-text-label)' }}
              >
                {t('automationPlatform')}
              </p>
            </div>
          </div>
          <div className="max-w-lg space-y-4 text-center">
            <h2 className="text-3xl font-semibold leading-tight text-brand-white">
              {t('brandingHeading')}
            </h2>
            <p
              className="text-lg leading-relaxed"
              style={{ color: 'var(--auth-branding-text-desc)' }}
            >
              {t('brandingTagline')}
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-auth-form-bg transition-colors duration-300">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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

            <div className="w-full max-w-md space-y-8">
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-bold text-text-primary">{t('heading')}</h2>
                <p className="text-text-secondary">{t('description')}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
                    {t('emailLabel')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 text-text-primary outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover"
                    required
                  />
                </div>

                <div className="flex justify-center">
                  <Turnstile
                    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                    options={{ size: 'flexible' }}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken(null)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending || !turnstileToken}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      {t('sending')}
                    </>
                  ) : (
                    <>
                      {t('sendButton')}
                      <ArrowRight
                        size={20}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>

                <div className="mt-6 text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-text-primary"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ArrowLeft size={16} />
                    {t('backToLogin')}
                  </Link>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
