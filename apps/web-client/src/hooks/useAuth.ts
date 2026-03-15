import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { useRouter } from 'next/navigation';

export interface User {
  sub: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName: string;
  plan: string;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
}

// Hook para obtener el usuario actual
export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const api = RootApi.getInstance().getAuthApi();
      try {
        return await api.getMe();
      } catch (error) {
        // Si falla (ej. 401), retornamos null para indicar que no hay usuario
        return null;
      }
    },
    retry: false, // No reintentar si falla la autenticación
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// Hook para login
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (credentials: {
      email: string;
      password: string;
      rememberMe?: boolean;
      turnstileToken?: string;
    }) => {
      try {
        const api = RootApi.getInstance().getAuthApi();
        return await api.login(credentials);
      } catch (error: any) {
        if (error.message === 'Invalid credentials or account inactive') {
          throw new Error('Email o contraseña incorrectos');
        }
        if (error.message && error.message.includes('ThrottlerException')) {
          throw new Error(
            'Demasiados intentos fallidos. Por favor, espera antes de intentar nuevamente.',
          );
        }
        throw error;
      }
    },
    onSuccess: (response: any) => {
      // response es ApiResponse<any> del backend
      // Estructura esperada para login exitoso directo: response.data.user
      // Estructura para 2FA requerido: response.data.require2FA

      if (response?.data?.user) {
        // Login completo (sin 2FA o tokens ya seteados)
        queryClient.setQueryData(['auth', 'me'], response.data.user);
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        router.push('/dashboard');
      } else if (response?.data?.require2FA) {
        // 2FA requerido - redirigir a página de verificación
        router.push('/verify-2fa');
      } else {
        // Fallback por si la respuesta no es estándar pero fue 200 OK
        // Intentamos recargar el usuario y si existe redirigimos
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  });
}

// Hook para verificar código 2FA
export function useVerify2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.verify2FACode({ code2FA: code });
    },
    onSuccess: () => {
      // Al verificar exitosamente, ahora sí tenemos el token final (cookie)
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

// Hook para iniciar configuración 2FA
export function useSetup2FA() {
  return useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.setup2FA();
    },
  });
}

// Hook para activar 2FA (cuando ya estás autenticado)
export function useEnable2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.enable2FA({ code2FA: code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// Hook para Signup Paso 1
export function useSignupStepOne() {
  return useMutation({
    mutationFn: async (data: {
      email: string;
      organizationName: string;
      userName: string;
      turnstileToken?: string;
    }) => {
      const api = RootApi.getInstance().getAuthApi();
      try {
        return await api.signupStepOne(data);
      } catch (error: any) {
        if (error.message && error.message.includes('ThrottlerException')) {
          throw new Error(
            'Demasiados intentos fallidos. Por favor, espera antes de intentar nuevamente.',
          );
        }
        throw error;
      }
    },
  });
}

// Hook para Signup Paso 2
export function useSignupStepTwo() {
  return useMutation({
    mutationFn: async (data: { verificationCode: string; email: string }) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.signupStepTwo(data);
    },
  });
}

// Hook para Signup Paso 3
export function useSignupStepThree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.signupStepThree(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

// Hook para Logout
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.logout();
    },
    onSuccess: () => {
      // Limpiar datos del usuario en cache
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      // Redirigir al login
      router.push('/login');
    },
  });
}

// Hook para Logout All
export function useLogoutAll() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.logoutAll();
    },
    onSuccess: () => {
      // Limpiar datos y redirigir
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.push('/login');
    },
  });
}
// Hook para Deshabilitar 2FA
export function useDisable2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.disable2FA({ code2FA: code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

// Hook para Reset Password Paso 1 (Enviar Email)
export function useResetPasswordStepOne() {
  return useMutation({
    mutationFn: async (data: { email: string; turnstileToken?: string }) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.resetPasswordStepOne(data);
    },
  });
}

// Hook para Reset Password Paso 2 (Verificar código y cambiar password)
export function useResetPasswordStepTwo() {
  return useMutation({
    mutationFn: async (data: { verificationCode: string; newPassword: string }) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.resetPasswordStepTwo(data);
    },
  });
}

// Hook para Cambiar Contraseña (estando logueado)
export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: {
      currentPassword: string;
      newPassword: string;
      code2FA?: string;
    }) => {
      const api = RootApi.getInstance().getAuthApi();
      return await api.changePassword(data);
    },
  });
}

// Helper para obtener URL de Google Auth (no necesita ser hook async, pero puede serlo para consistencia si se desea, aquí lo haré función simple o hook que retorna string)
export function useGoogleAuthUrl() {
  // Como es síncrono en el API, podemos retornarlo directamente o usar useQuery si quisieramos que fuera reactivo a cambios de env (raro).
  // Lo haré una función que retorna el valor, pero envuelta en un hook por si acaso se necesita lógica futura.
  const api = RootApi.getInstance().getAuthApi();
  return api.getGoogleAuthUrl();
}
