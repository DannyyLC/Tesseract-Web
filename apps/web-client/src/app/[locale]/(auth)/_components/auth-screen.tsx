'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowRight, Building2, Mail, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { FcGoogle } from 'react-icons/fc';
import Image from 'next/image';
import { useRouter, Link } from '@/i18n/routing';
import {
  useAuth,
  useLogin,
  useSignupStepOne,
  useSignupStepTwo,
  useSignupStepThree,
  useGoogleAuthUrl,
} from '@/hooks/identity/use-auth';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';

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
const RESEND_COOLDOWN_KEY = 'resend_cooldown_until';
const RESEND_COOLDOWN_SECONDS = 120;

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
  const turnstileRef = useRef<TurnstileInstance>(null);
  const resendTurnstileRef = useRef<TurnstileInstance>(null);
  // Cooldown para reenvío de código
  const [resendCooldown, setResendCooldown] = useState(0);

  /* ========================================= */
  /* EFFECTS */
  /* ========================================= */
  // Redireccionar si ya está logueado
  useEffect(() => {
    if (user && !isLoadingUser) {
      router.push('/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoadingUser]);
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
      const storedUntil = sessionStorage.getItem(RESEND_COOLDOWN_KEY);
      if (storedUntil) {
        const remaining = Math.ceil((parseInt(storedUntil) - Date.now()) / 1000);
        if (remaining > 0) setResendCooldown(remaining);
      }
      setIsInitialized(true);
    } else {
      setIsInitialized(true);
    }
  }, [isLogin]);
  // Cronómetro de cooldown: un tick por segundo usando setTimeout en cadena
  useEffect(() => {
    if (resendCooldown <= 0) {
      sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
      return;
    }
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);
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
  const startResendCooldown = () => {
    const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    sessionStorage.setItem(RESEND_COOLDOWN_KEY, String(until));
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };
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
        setVerificationCode('');
        setTurnstileToken(null); // el token del paso 1 ya fue consumido
        startResendCooldown();
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
        sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
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
        setResendCooldown(0);
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
      // Redirigir al dashboard o onboarding con flag de bienvenida
      router.push('/billing/plans?welcome=true');
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
            setTurnstileToken(null);
            turnstileRef.current?.reset();
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
      <div className="flex h-screen items-center justify-center bg-surface">
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
    <div className="flex h-screen overflow-hidden bg-brand-black">
      {/* SECCIÓN IZQUIERDA - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-gradient-start via-gradient-mid to-gradient-end lg:flex lg:w-1/2">
        {/* Capa base para Dark Mode: Gradiente de izquierda a derecha para uniformidad vertical */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-brand-black via-brand-black to-brand-black block" />

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
              Tu plataforma de automatización empresarial
            </h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--auth-branding-text-desc)' }}>
              Potencia tu negocio con automatización inteligente
            </p>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_50%)]" />
      </div>

      {/* SECCIÓN DERECHA - FORMULARIO */}
      <div className="h-full flex-1 overflow-y-auto bg-auth-form-bg transition-colors duration-300">
        <div className="flex min-h-full flex-col items-center justify-center p-8 py-20">
          <motion.div
            className="w-full max-w-md space-y-8"
            // Si es Sign Up (!isLogin), bajamos el bloque 40 píxeles.
            animate={{ y: !isLogin ? 1 : 0 }}
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
              {/* Mode Switcher */}
              <div className="relative rounded-2xl bg-surface-secondary p-1.5 shadow-inner">
                <div className="relative z-10 grid grid-cols-2 gap-0">
                  <Link
                    href="/login"
                    className={`relative rounded-xl py-3 text-center font-semibold transition-colors duration-300 ${
                      isLogin ? 'text-text-inverse' : 'text-text-secondary'
                    }`}
                  >
                    {/* El fondo animado solo se renderiza si isLogin es true */}
                    {isLogin && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-xl bg-accent shadow-lg"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20">Login</span>
                  </Link>

                  <Link
                    href="/signup"
                    className={`relative rounded-xl py-3 text-center font-semibold transition-colors duration-300 ${
                      !isLogin ? 'text-text-inverse' : 'text-text-secondary'
                    }`}
                  >
                    {/* El mismo layoutId para que la animación se comparta */}
                    {!isLogin && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-xl bg-accent shadow-lg"
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
                      <div
                        className="rounded-xl border p-4 text-sm"
                        style={{
                          background: 'var(--danger-banner-bg)',
                          borderColor: 'var(--danger-banner-border)',
                          color: 'var(--danger-text-adaptive)',
                        }}
                      >
                        {(loginMutationError as Error).message || 'Error al iniciar sesión'}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-text-primary">
                        Email
                      </label>
                      <input
                        type="email"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        placeholder="ejemplo@empresa.com"
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
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
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

                    <div className="flex items-center justify-between">
                      <label className="group flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={loginData.rememberMe}
                          onChange={(e) =>
                            setLoginData({ ...loginData, rememberMe: e.target.checked })
                          }
                          className="h-5 w-5 cursor-pointer rounded border-2 border-border-hover text-accent focus:ring-0"
                        />
                        <span className="text-sm text-text-secondary group-hover:text-text-primary/70 ">
                          Recordarme
                        </span>
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-sm font-medium text-text-secondary hover:text-text-primary"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>

                    <div className="flex justify-center">
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                        options={{ size: 'flexible' }}
                        onSuccess={(token) => setTurnstileToken(token)}
                        onExpire={() => setTurnstileToken(null)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn || !turnstileToken}
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
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
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                            <motion.div
                              className="h-full rounded-full bg-accent"
                              initial={{ width: '0%' }}
                              animate={{ width: '33%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-text-tertiary">1/3</span>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-text-primary">
                            Nombre completo
                          </label>
                          <input
                            type="text"
                            value={signupData.fullName}
                            onChange={(e) =>
                              setSignupData({ ...signupData, fullName: e.target.value })
                            }
                            placeholder="Tu nombre y apellido"
                            className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-text-primary">
                            Email corporativo
                          </label>
                          <input
                            type="email"
                            value={signupData.email}
                            onChange={(e) =>
                              setSignupData({ ...signupData, email: e.target.value })
                            }
                            placeholder="ejemplo@empresa.com"
                            className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-text-primary">
                            Nombre de la organización
                          </label>
                          <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                              <Building2 size={20} />
                            </div>
                            <input
                              type="text"
                              value={signupData.organizationName}
                              onChange={(e) =>
                                setSignupData({ ...signupData, organizationName: e.target.value })
                              }
                              placeholder="Ej: Mi Empresa S.A."
                              className="w-full rounded-xl border-2 border-transparent bg-input-bg py-3.5 pl-12 pr-4 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                              required
                            />
                          </div>
                          <p className="mt-1 text-xs text-text-secondary">
                            Este será el espacio de trabajo para tu equipo. Podrás invitar miembros
                            y configurar permisos después.
                          </p>
                        </div>

                        <label className="group flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(e) => setAcceptTerms(e.target.checked)}
                            className="mt-0.5 h-5 w-5 cursor-pointer rounded border-2 border-border-hover text-accent focus:ring-0"
                            required
                          />
                          <span className="text-sm text-text-secondary group-hover:text-text-primary/70 ">
                            Acepto los{' '}
                            <Link
                              href="/terms"
                              className="font-medium text-accent underline"
                            >
                              Términos
                            </Link>{' '}
                            y la{' '}
                            <Link
                              href="/privacy"
                              className="font-medium text-accent underline"
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
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
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
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                            <motion.div
                              className="h-full rounded-full bg-accent"
                              initial={{ width: '33%' }}
                              animate={{ width: '66%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-text-tertiary">2/3</span>
                        </div>

                        <div className="mb-4 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                            <Mail className="h-8 w-8 text-text-primary" />
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-text-primary">
                            Verifica tu email
                          </h3>
                          <p className="text-sm text-text-secondary">
                            Hemos enviado un código de verificación a
                          </p>
                          <p className="mt-1 text-sm font-medium text-text-primary">
                            {signupData.email}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-text-primary">
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
                            className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 text-center font-mono text-2xl tracking-widest outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                            required
                            maxLength={6}
                            autoFocus
                          />
                          {verificationError && (
                            <p className="text-sm" style={{ color: 'var(--danger-text-adaptive)' }}>
                              {verificationError}
                            </p>
                          )}
                          {verificationAttempts > 0 && verificationAttempts < 3 && (
                            <p className="text-xs text-text-secondary">
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
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
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

                        <div className="flex justify-center">
                          <Turnstile
                            ref={resendTurnstileRef}
                            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                            options={{ size: 'flexible' }}
                            onSuccess={(token) => setTurnstileToken(token)}
                            onExpire={() => setTurnstileToken(null)}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            const codeSent = await sendVerificationCode(signupData.email);
                            if (codeSent) {
                              startResendCooldown();
                              setTurnstileToken(null);
                              resendTurnstileRef.current?.reset();
                              setVerificationError('');
                              setVerificationCode('');
                            }
                          }}
                          disabled={signupStepOneMutation.isPending || resendCooldown > 0 || !turnstileToken}
                          className="w-full text-sm transition-colors hover:text-text-primary disabled:opacity-50"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {signupStepOneMutation.isPending
                            ? 'Reenviando...'
                            : resendCooldown > 0
                              ? `Reenviar en ${Math.floor(resendCooldown / 60)}:${String(resendCooldown % 60).padStart(2, '0')}`
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
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                            <motion.div
                              className="h-full rounded-full bg-accent"
                              initial={{ width: '66%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-xs text-text-tertiary">3/3</span>
                        </div>

                        <div className="mb-4 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                            <Lock className="h-8 w-8 text-text-primary" />
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-text-primary">
                            Crea tu contraseña
                          </h3>
                          <p className="text-sm text-text-secondary">
                            Tu contraseña debe tener al menos 8 caracteres
                          </p>
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
                              minLength={8}
                              autoComplete="new-password"
                              id="new-password"
                              name="new-password"
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
                            Confirmar contraseña
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full rounded-xl border-2 border-transparent bg-input-bg px-4 py-3.5 pr-12 outline-none transition-all focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary"
                              required
                              autoComplete="new-password"
                              id="confirm-password"
                              name="confirm-password"
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

                        <button
                          type="submit"
                          data-testid="create-account-button"
                          disabled={
                            signupStepThreeMutation.isPending ||
                            !password ||
                            !confirmPassword ||
                            password.length < 8
                          }
                          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 font-semibold text-text-inverse transition-all hover:bg-accent-hover"
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
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-auth-form-bg px-4 text-xs uppercase tracking-wider text-text-tertiary">
                      O continuar con
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleAuth}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-border bg-surface-elevated px-4 py-3.5 transition-all hover:border-border-hover"
                >
                  <FcGoogle className="h-5 w-5" />
                  <span className="font-medium text-text-primary">Google</span>
                </button>

                {!isLogin && (
                  <p className="text-center text-xs text-text-secondary">
                    Al continuar con Google, aceptas nuestros{' '}
                    <Link
                      href="/terms"
                      className="font-medium text-accent underline transition-colors hover:opacity-80"
                    >
                      Términos
                    </Link>{' '}
                    y la{' '}
                    <Link
                      href="/privacy"
                      className="font-medium text-accent underline transition-colors hover:opacity-80"
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
