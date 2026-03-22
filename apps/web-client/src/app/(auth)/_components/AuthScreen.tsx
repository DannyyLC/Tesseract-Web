'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowRight, Building2, Mail, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { FcGoogle } from 'react-icons/fc';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useAuth,
  useLogin,
  useSignupStepOne,
  useSignupStepTwo,
  useSignupStepThree,
  useGoogleAuthUrl,
} from '@/hooks/useAuth';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Turnstile } from '@marsidev/react-turnstile';

/* ========================================= */
/* INTERFACES, TYPES & CONSTANTS */
/* ========================================= */
interface AuthScreenProps {
  mode: 'login' | 'signup';
}
// Tipos para el estado del registro
type SignupStep = 1 | 2 | 3;

interface SignupData {
  fullName: string;
  email: string;
  organizationName: string;
}
const STORAGE_KEY = 'signup_data';

/* ========================================= */
/* COMPONENT */
/* ========================================= */
export default function AuthScreen({ mode }: AuthScreenProps) {
  const isLogin = mode === 'login';
  const router = useRouter();

  /* ========================================= */
  /* CONFIG & HOOKS */
  /* ========================================= */
  // Hooks de React Query
  const { data: user, isLoading: isLoadingUser } = useAuth();
  const { mutate: login, isPending: isLoggingIn, error: loginMutationError } = useLogin();
  const signupStepOneMutation = useSignupStepOne();
  const signupStepTwoMutation = useSignupStepTwo();
  const signupStepThreeMutation = useSignupStepThree();
  const googleAuthUrl = useGoogleAuthUrl();

  /* ========================================= */
  /* STATE MANAGEMENT */
  /* ========================================= */
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  // Estados para signup (flujo por pasos)
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [signupData, setSignupData] = useState<SignupData>({
    fullName: '',
    email: '',
    organizationName: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Código de verificación
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [verificationError, setVerificationError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  /* ========================================= */
  /* EFFECTS */
  /* ========================================= */
  // Redireccionar si ya está logueado
  useEffect(() => {
    if (user && !isLoadingUser) {
      router.push('/dashboard');
    }
  }, [user, isLoadingUser, router]);
  // Cargar datos del sessionStorage al montar el componente
  useEffect(() => {
    if (!isLogin) {
      const savedData = sessionStorage.getItem(STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setSignupData(parsed.data);
          setSignupStep(parsed.step || 1);
          setVerificationAttempts(parsed.attempts || 0);
        } catch (error) {
          console.error('Error al cargar datos del sessionStorage:', error);
        }
      }
      setIsInitialized(true);
    } else {
      setIsInitialized(true);
    }
  }, [isLogin]);
  // Guardar datos en sessionStorage cuando cambian
  useEffect(() => {
    if (!isLogin) {
      const dataToSave = {
        data: signupData,
        step: signupStep,
        attempts: verificationAttempts,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [signupData, signupStep, verificationAttempts, isLogin]);

  /* ========================================= */
  /* API HELPERS */
  /* ========================================= */
  // Función para enviar código de verificación (Paso 1)
  const sendVerificationCode = async (email: string) => {
    // Propagamos el error para manejarlo en el componente y mostrar el toast específico
    await signupStepOneMutation.mutateAsync({
      email,
      organizationName: signupData.organizationName,
      userName: signupData.fullName,
      turnstileToken: turnstileToken || undefined,
    });
    return true;
  };
  // Función para verificar código (Paso 2)
  const verifyCode = async (email: string, code: string) => {
    setVerificationError('');
    try {
      const isValid = await signupStepTwoMutation.mutateAsync({
        email,
        verificationCode: code,
      });
      return isValid;
    } catch {
      return false;
    }
  };
  // Función para registro final (Paso 3)
  const submitSignup = async (email: string, pass: string) => {
    // Propagamos el error para manejarlo en el componente y mostrar el toast
    await signupStepThreeMutation.mutateAsync({
      email,
      password: pass,
    });
    // Limpiar sessionStorage después de registro exitoso
    sessionStorage.removeItem(STORAGE_KEY);
  };

  /* ========================================= */
  /* EVENT HANDLERS */
  /* ========================================= */
  // Manejar paso 1 del signup
  const handleSignupStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !signupData.fullName.trim() ||
      !signupData.email.trim() ||
      !signupData.organizationName.trim()
    ) {
      return;
    }

    // Enviar código de verificación automáticamente
    try {
      const codeSent = await sendVerificationCode(signupData.email);
      if (codeSent) {
        setSignupStep(2);
        setVerificationAttempts(0);
        setVerificationError('');
        // Limpiar estados locales
        setVerificationCode('');
      }
    } catch (error: any) {
      console.error('Error en paso 1:', error);
      // Verificamos si es el error específico de email ya existente
      if (error?.errors?.includes('EMAIL_ALREADY_EXISTS')) {
        toast.error('Este correo electrónico ya está registrado.');
      } else {
        toast.error(
          error.message ||
            'Error al enviar el código de verificación. Por favor, intenta nuevamente.',
        );
      }
    }
  };
  // Manejar paso 2 del signup (verificación)
  const handleSignupStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      return;
    }

    const isValid = await verifyCode(signupData.email, verificationCode);

    if (isValid) {
      setSignupStep(3);
      setVerificationError('');
      // Limpiar password states
      setPassword('');
      setConfirmPassword('');
    } else {
      const newAttempts = verificationAttempts + 1;
      setVerificationAttempts(newAttempts);

      if (newAttempts >= 3) {
        // Máximo de intentos alcanzado, resetear todo
        sessionStorage.removeItem(STORAGE_KEY);
        setSignupData({
          fullName: '',
          email: '',
          organizationName: '',
        });
        // Limpiar locales
        setVerificationCode('');
        setPassword('');
        setConfirmPassword('');
        setSignupStep(1);
        setVerificationAttempts(0);
        setVerificationError('');
        toast.error('Has excedido el número máximo de intentos. Por favor, comienza de nuevo.');
      } else {
        setVerificationError(`Código incorrecto. Intentos restantes: ${3 - newAttempts}`);
        setVerificationCode('');
      }
    }
  };
  // Manejar paso 3 del signup (contraseña)
  const handleSignupStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      await submitSignup(signupData.email, password);
      // Redirigir al dashboard o onboarding
      router.push('/billing/plans');
      toast.success('Cuenta creada exitosamente');
    } catch (error: any) {
      console.error('Error al registrar usuario:', error);
      // Mostrar el mensaje de error específico (ej: requisitos de contraseña)
      toast.error(error.message || 'Error al crear la cuenta. Por favor, intenta nuevamente.');
    }
  };
  // Manejar login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      login(
        { ...loginData, turnstileToken: turnstileToken || undefined },
        {
          onError: () => {
            setLoginData((prev) => ({
              ...prev,
              password: '',
            }));
          },
        },
      );
    }
  };
  // Login mediante Google
  const handleGoogleAuth = () => {
    window.location.href = googleAuthUrl;
  };

  /* ========================================= */
  /* RENDER */
  /* ========================================= */
  // Mostrar loading mientras verificamos autenticación para evitar flash del formulario
  if (isLoadingUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-black">
        <LogoLoader text="Verificando" />
      </div>
    );
  }
  // Si el usuario está autenticado, no mostrar nada
  if (user) {
    return null;
  }

  return (
    // Contenedor principal: bloquea el scroll global
    <div className="flex h-screen overflow-hidden bg-black">
      {/* SECCIÓN IZQUIERDA - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#0A0A0A] to-[#1A1A1A] lg:flex lg:w-1/2">
        {/* Capa base para Dark Mode: Gradiente de izquierda a derecha para uniformidad vertical */}
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
              Tu plataforma de automatización empresarial
            </h2>
            <p className="text-lg leading-relaxed text-white/60">
              Potencia tu negocio con automatización inteligente
            </p>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-white transition-colors duration-300 dark:bg-black">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            // Si es Sign Up (!isLogin), bajamos el bloque 40 píxeles.
            animate={{ y: !isLogin ? 1 : 0 }}
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
              {/* Mode Switcher */}
              <div className="relative rounded-2xl bg-[#F5F5F5] p-1.5 shadow-inner dark:bg-[#171717]">
                <div className="relative z-10 grid grid-cols-2 gap-0">
                  <Link
                    href="/login"
                    className={`relative rounded-xl py-3 text-center font-semibold transition-colors duration-300 ${
                      isLogin ? 'text-white dark:text-black' : 'text-black/50 dark:text-white/50'
                    }`}
                  >
                    {/* El fondo animado solo se renderiza si isLogin es true */}
                    {isLogin && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-xl bg-black shadow-lg dark:bg-white"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20">Login</span>
                  </Link>

                  <Link
                    href="/signup"
                    className={`relative rounded-xl py-3 text-center font-semibold transition-colors duration-300 ${
                      !isLogin ? 'text-white dark:text-black' : 'text-black/50 dark:text-white/50'
                    }`}
                  >
                    {/* El mismo layoutId para que la animación se comparta */}
                    {!isLogin && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-xl bg-black shadow-lg dark:bg-white"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20">Sign Up</span>
                  </Link>
                </div>
              </div>

              {/* Form Container */}
              <div className="space-y-6">
                {isLogin ? (
                  // FORMULARIO DE LOGIN
                  <form onSubmit={handleLogin} className="space-y-5">
                    {loginMutationError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/20 dark:bg-red-900/10 dark:text-red-400">
                        {(loginMutationError as Error).message || 'Error al iniciar sesión'}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                        Email
                      </label>
                      <input
                        type="email"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        placeholder="ejemplo@empresa.com"
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
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
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

                    <div className="flex items-center justify-between">
                      <label className="group flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={loginData.rememberMe}
                          onChange={(e) =>
                            setLoginData({ ...loginData, rememberMe: e.target.checked })
                          }
                          className="h-5 w-5 cursor-pointer rounded border-2 border-black/20 text-black focus:ring-0 dark:border-white/20 dark:text-white"
                        />
                        <span className="text-sm text-black/70 group-hover:text-black dark:text-white/70 dark:group-hover:text-white">
                          Recordarme
                        </span>
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-sm font-medium text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
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
                      disabled={isLoggingIn || !turnstileToken}
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-black dark:hover:bg-white/90"
                    >
                      {isLoggingIn ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Iniciando sesión...
                        </>
                      ) : (
                        <>
                          Iniciar Sesión
                          <ArrowRight
                            size={20}
                            className="transition-transform group-hover:translate-x-1"
                          />
                        </>
                      )}
                    </button>
                  </form>
                ) : // FORMULARIO DE SIGNUP (FLUJO POR PASOS)
                !isInitialized ? (
                  // Estado de carga inicial (para evitar flash del paso 1)
                  <div className="flex justify-center py-20"></div>
                ) : (
                  <AnimatePresence mode="wait">
                    {/* Paso 1: Datos del usuario y organización */}
                    {signupStep === 1 && (
                      <motion.form
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleSignupStep1}
                        className="space-y-5"
                      >
                        {/* Indicador de progreso */}
                        <div className="mb-4 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <motion.div
                              className="h-full rounded-full bg-black dark:bg-white"
                              initial={{ width: '0%' }}
                              animate={{ width: '33%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-black/40 dark:text-white/40">1/3</span>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                            Nombre completo
                          </label>
                          <input
                            type="text"
                            value={signupData.fullName}
                            onChange={(e) =>
                              setSignupData({ ...signupData, fullName: e.target.value })
                            }
                            placeholder="Tu nombre y apellido"
                            className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                            Email corporativo
                          </label>
                          <input
                            type="email"
                            value={signupData.email}
                            onChange={(e) =>
                              setSignupData({ ...signupData, email: e.target.value })
                            }
                            placeholder="ejemplo@empresa.com"
                            className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                            Nombre de la organización
                          </label>
                          <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40">
                              <Building2 size={20} />
                            </div>
                            <input
                              type="text"
                              value={signupData.organizationName}
                              onChange={(e) =>
                                setSignupData({ ...signupData, organizationName: e.target.value })
                              }
                              placeholder="Ej: Mi Empresa S.A."
                              className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] py-3.5 pl-12 pr-4 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                              required
                            />
                          </div>
                          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                            Este será el espacio de trabajo para tu equipo. Podrás invitar miembros
                            y configurar permisos después.
                          </p>
                        </div>

                        <label className="group flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(e) => setAcceptTerms(e.target.checked)}
                            className="mt-0.5 h-5 w-5 cursor-pointer rounded border-2 border-black/20 text-black focus:ring-0 dark:border-white/20 dark:text-white"
                            required
                          />
                          <span className="text-sm text-black/70 group-hover:text-black dark:text-white/70 dark:group-hover:text-white">
                            Acepto los{' '}
                            <Link
                              href="/terms"
                              className="font-medium text-black underline dark:text-white"
                            >
                              Términos
                            </Link>{' '}
                            y la{' '}
                            <Link
                              href="/privacy"
                              className="font-medium text-black underline dark:text-white"
                            >
                              Privacidad
                            </Link>
                          </span>
                        </label>

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
                          disabled={
                            signupStepOneMutation.isPending ||
                            !signupData.fullName.trim() ||
                            !signupData.email.trim() ||
                            !signupData.organizationName.trim() ||
                            !acceptTerms ||
                            !turnstileToken
                          }
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                        >
                          {signupStepOneMutation.isPending ? (
                            <>
                              <Loader2 size={20} className="animate-spin" />
                              Enviando código...
                            </>
                          ) : (
                            <>
                              Continuar
                              <ArrowRight
                                size={20}
                                className="transition-transform group-hover:translate-x-1"
                              />
                            </>
                          )}
                        </button>
                      </motion.form>
                    )}

                    {/* Paso 2: Código de verificación */}
                    {signupStep === 2 && (
                      <motion.form
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleSignupStep2}
                        className="space-y-5"
                      >
                        {/* Indicador de progreso */}
                        <div className="mb-4 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <motion.div
                              className="h-full rounded-full bg-black dark:bg-white"
                              initial={{ width: '33%' }}
                              animate={{ width: '66%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-black/40 dark:text-white/40">2/3</span>
                        </div>

                        <div className="mb-4 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
                            <Mail className="h-8 w-8 text-black dark:text-white" />
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
                            Verifica tu email
                          </h3>
                          <p className="text-sm text-black/60 dark:text-white/60">
                            Hemos enviado un código de verificación a
                          </p>
                          <p className="mt-1 text-sm font-medium text-black dark:text-white">
                            {signupData.email}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-black/70 dark:text-white/70">
                            Código de verificación
                          </label>
                          <input
                            type="text"
                            value={verificationCode}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                              setVerificationCode(value);
                              setVerificationError('');
                            }}
                            placeholder="000000"
                            className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 text-center font-mono text-2xl tracking-widest text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                            required
                            maxLength={6}
                            autoFocus
                          />
                          {verificationError && (
                            <p className="text-sm text-red-500 dark:text-red-400">
                              {verificationError}
                            </p>
                          )}
                          {verificationAttempts > 0 && verificationAttempts < 3 && (
                            <p className="text-xs text-black/50 dark:text-white/50">
                              Intentos restantes: {3 - verificationAttempts}
                            </p>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={
                            signupStepTwoMutation.isPending ||
                            !verificationCode.trim() ||
                            verificationCode.length !== 6
                          }
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                        >
                          {signupStepTwoMutation.isPending ? (
                            <>
                              <Loader2 size={20} className="animate-spin" />
                              Verificando...
                            </>
                          ) : (
                            <>
                              Verificar código
                              <ArrowRight
                                size={20}
                                className="transition-transform group-hover:translate-x-1"
                              />
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const codeSent = await sendVerificationCode(signupData.email);
                            if (codeSent) {
                              setVerificationError('');
                              setVerificationCode('');
                            }
                          }}
                          disabled={signupStepOneMutation.isPending}
                          className="w-full text-sm text-black/60 transition-colors hover:text-black disabled:opacity-50 dark:text-white/60 dark:hover:text-white"
                        >
                          {signupStepOneMutation.isPending
                            ? 'Reenviando...'
                            : '¿No recibiste el código? Reenviar'}
                        </button>
                      </motion.form>
                    )}

                    {/* Paso 3: Contraseña */}
                    {signupStep === 3 && (
                      <motion.form
                        key="step3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleSignupStep3}
                        className="space-y-5"
                      >
                        {/* Campo oculto para ayudar a los gestores de contraseñas */}
                        <input
                          type="text"
                          name="username"
                          value={signupData.email}
                          autoComplete="username"
                          className="hidden"
                          readOnly
                        />
                        {/* Indicador de progreso */}
                        <div className="mb-4 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <motion.div
                              className="h-full rounded-full bg-black dark:bg-white"
                              initial={{ width: '66%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-black/40 dark:text-white/40">3/3</span>
                        </div>

                        <div className="mb-4 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
                            <Lock className="h-8 w-8 text-black dark:text-white" />
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
                            Crea tu contraseña
                          </h3>
                          <p className="text-sm text-black/60 dark:text-white/60">
                            Tu contraseña debe tener al menos 8 caracteres
                          </p>
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
                              minLength={8}
                              autoComplete="new-password"
                              id="new-password"
                              name="new-password"
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
                            Confirmar contraseña
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full rounded-xl border-2 border-transparent bg-[#F5F5F5] px-4 py-3.5 pr-12 text-black outline-none transition-all focus:border-black focus:bg-white dark:bg-[#171717] dark:text-white dark:focus:border-white dark:focus:bg-[#1A1A1A]"
                              required
                              autoComplete="new-password"
                              id="confirm-password"
                              name="confirm-password"
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

                        <button
                          type="submit"
                          disabled={
                            signupStepThreeMutation.isPending ||
                            !password ||
                            !confirmPassword ||
                            password.length < 8
                          }
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 font-semibold text-white transition-all hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                        >
                          {signupStepThreeMutation.isPending ? (
                            <>
                              <Loader2 size={20} className="animate-spin" />
                              Creando cuenta...
                            </>
                          ) : (
                            <>
                              Crear Cuenta
                              <ArrowRight
                                size={20}
                                className="transition-transform group-hover:translate-x-1"
                              />
                            </>
                          )}
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/10 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-4 text-xs uppercase tracking-wider text-black/40 dark:bg-black dark:text-white/40">
                      O continuar con
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleAuth}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-black/10 bg-white px-4 py-3.5 transition-all hover:border-black/30 dark:border-white/10 dark:bg-[#171717] dark:hover:border-white/30"
                >
                  <FcGoogle className="h-5 w-5" />
                  <span className="font-medium text-black/70 dark:text-white/70">Google</span>
                </button>

                {!isLogin && (
                  <p className="text-center text-xs text-black/50 dark:text-white/50">
                    Al continuar con Google, aceptas nuestros{' '}
                    <Link
                      href="/terms"
                      className="font-medium text-black underline transition-colors hover:text-black/80 dark:text-white dark:hover:text-white/80"
                    >
                      Términos
                    </Link>{' '}
                    y la{' '}
                    <Link
                      href="/privacy"
                      className="font-medium text-black underline transition-colors hover:text-black/80 dark:text-white dark:hover:text-white/80"
                    >
                      Privacidad
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
