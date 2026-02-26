'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useResetPasswordStepOne } from '@/hooks/useAuth';
import { Turnstile } from '@marsidev/react-turnstile';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { mutateAsync: sendResetCode, isPending } = useResetPasswordStepOne();

  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !turnstileToken) return;

    try {
      await sendResetCode({ email, turnstileToken });
      toast.success('Si el correo existe, se ha enviado un código de verificación.');
      router.push('/reset-password');
    } catch (error: any) {
      toast.error(error.message || 'Error al enviar el correo. Por favor, intenta de nuevo.');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SECCIÓN IZQUIERDA - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#0A0A0A] to-[#1A1A1A] lg:flex lg:w-1/2">
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-black via-[#0A0A0A] to-black dark:block" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden dark:block"
          style={{
            width: '100%',
            background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0) 50%, #000000 100%)',
          }}
        />
        <div className="z-5 absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        </div>
        
        {/* Floating Geometric Elements */}
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
              <p className="mt-1 text-sm uppercase tracking-widest text-white/40">Automation Platform</p>
            </div>
          </div>
          <div className="max-w-lg space-y-4 text-center">
            <h2 className="text-3xl font-semibold leading-tight text-white">
              Recupera tu acceso
            </h2>
            <p className="text-lg leading-relaxed text-white/60">
              Te enviaremos un código para restablecer tu contraseña
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-white transition-colors duration-300 dark:bg-black">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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

            <div className="w-full max-w-md space-y-8">
               <div className="space-y-2 text-center">
                 <h2 className="text-3xl font-bold text-black dark:text-white">
                   ¿Olvidaste tu contraseña?
                 </h2>
                 <p className="text-black/60 dark:text-white/60">
                   Ingresa tu correo electrónico y te enviaremos un código de verificación.
                 </p>
               </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@empresa.com"
                    className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
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
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      Enviar código
                      <ArrowRight
                        size={20}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>
                
                <div className="text-center mt-6">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm font-medium text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white transition-colors"
                  >
                    <ArrowLeft size={16} />
                    Volver al login
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
