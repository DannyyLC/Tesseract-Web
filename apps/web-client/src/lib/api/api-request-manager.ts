import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { toast } from 'sonner';

/**
 * Locale activo para mandarlo al gateway en `X-Locale`. No hay preferencia persistida en
 * BD a propósito (ver plan de bilingüismo): la fuente de verdad es la URL/cookie que ya
 * maneja next-intl (`NEXT_LOCALE`), nunca un campo de usuario u organización.
 */
function getCurrentLocale(): 'es' | 'en' {
  if (typeof window === 'undefined') return 'es';

  const pathMatch = window.location.pathname.match(/^\/(es|en)(\/|$)/);
  if (pathMatch) return pathMatch[1] as 'es' | 'en';

  const cookieMatch = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(es|en)/);
  if (cookieMatch) return cookieMatch[1] as 'es' | 'en';

  return 'es';
}

const HTTP_ERROR_MESSAGES = {
  es: {
    tooManyRequests: {
      title: 'Demasiadas solicitudes',
      description: 'Espera un momento e intenta de nuevo.',
    },
    forbidden: {
      title: 'Acceso denegado',
      description: 'No tienes permisos para realizar esta acción.',
    },
    serverError: {
      title: 'Error del servidor',
      description: 'Ocurrió un problema interno. Intenta de nuevo más tarde.',
    },
  },
  en: {
    tooManyRequests: {
      title: 'Too many requests',
      description: 'Please wait a moment and try again.',
    },
    forbidden: {
      title: 'Access denied',
      description: "You don't have permission to do this.",
    },
    serverError: {
      title: 'Server error',
      description: 'An internal problem occurred. Please try again later.',
    },
  },
} as const;

class ApiRequestManager {
  private static instance: ApiRequestManager;
  private axiosInstance: AxiosInstance;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api',
      timeout: 30000, // 30 seconds
      withCredentials: true, // Importante para enviar cookies httpOnly
    });

    // Optional: Add interceptors
    this.axiosInstance.interceptors.request.use(
      (config) => {
        config.headers['X-Locale'] = getCurrentLocale();
        return config;
      },
      (error) => Promise.reject(error),
    );
    // Flag to prevent infinite loops
    let isRefreshing = false;
    let failedQueue: Array<{ resolve: (value?: any) => void; reject: (reason?: any) => void }> = [];

    const processQueue = (error: any, token: string | null = null) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve(token);
        }
      });
      failedQueue = [];
    };

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // Si recibimos 401 y no hemos intentado refrescar aún
        if (
          status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url.includes('/login') &&
          !originalRequest.url.includes('/signup') &&
          !originalRequest.url.includes('/verify-2fa') &&
          !originalRequest.url.includes('/forgot-password') &&
          !originalRequest.url.includes('/auth/refresh')
        ) {
          if (isRefreshing) {
            return new Promise(function (resolve, reject) {
              failedQueue.push({ resolve, reject });
            })
              .then(() => {
                return this.axiosInstance(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            // Importación explícita para evitar ciclos si es necesario, pero aquí usamos axios directo
            // Llamamos al endpoint de refresh
            await this.axiosInstance.post('/auth/refresh');

            isRefreshing = false;
            processQueue(null);
            // Reintentamos la petición original
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            isRefreshing = false;
            processQueue(refreshError);
            // Si falla el refresh, redirigimos al login.
            // Las rutas llevan prefijo de locale (/es/login, /en/login), usamos endsWith.
            if (typeof window !== 'undefined') {
              const pathname = window.location.pathname;
              const authPaths = ['/login', '/signup', '/verify-2fa', '/forgot-password'];
              const isAuthPage = authPaths.some((p) => pathname.endsWith(p));
              if (!isAuthPage) {
                const localeMatch = pathname.match(/^\/([a-z]{2})(\/|$)/);
                const locale = localeMatch ? localeMatch[1] : 'es';
                window.location.href = `/${locale}/login`;
              }
            }
            return Promise.reject(refreshError);
          }
        }

        // ── Manejo centralizado de errores HTTP comunes ──
        // Se usa `id` para que sonner reemplace toasts duplicados en vez de apilarlos.
        // Se marca `toastHandled` para que los componentes sepan que ya se mostró un toast.
        // Este archivo es una clase singleton fuera del árbol de React: no tiene acceso a
        // `useTranslations`, así que estos 3 toasts (los únicos que dispara el interceptor
        // mismo, sin pasar por un componente) usan un diccionario bilingüe propio en vez de
        // texto fijo en español.
        let toastHandled = false;
        const locale = getCurrentLocale();

        // 429 — Throttler / Rate Limit
        if (status === 429) {
          toast.error(HTTP_ERROR_MESSAGES[locale].tooManyRequests.title, {
            id: 'http-429',
            description: HTTP_ERROR_MESSAGES[locale].tooManyRequests.description,
          });
          toastHandled = true;
        }

        // 403 — Forbidden / Sin permisos
        if (status === 403) {
          toast.error(HTTP_ERROR_MESSAGES[locale].forbidden.title, {
            id: 'http-403',
            description: HTTP_ERROR_MESSAGES[locale].forbidden.description,
          });
          toastHandled = true;
        }

        // 500+ — Error interno del servidor
        if (status && status >= 500) {
          toast.error(HTTP_ERROR_MESSAGES[locale].serverError.title, {
            id: 'http-500',
            description: HTTP_ERROR_MESSAGES[locale].serverError.description,
          });
          toastHandled = true;
        }

        // El back siempre manda `errorCode` (ver GlobalExceptionFilter) — los componentes
        // deben traducir por ahí (ej. con `useApiErrorMessage`), nunca mostrar `message`
        // directo, porque ese texto no tiene garantía de idioma.
        const errorCode = error.response?.data?.errorCode;
        const serverMessage = error.response?.data?.message || error.response?.data?.error;
        const finalMessage = serverMessage || error.message || 'Ocurrió un error inesperado';

        // Creamos un error personalizado que incluye la respuesta completa para acceder a campos específicos como 'errors'
        const customError: any = new Error(finalMessage);
        customError.response = error.response;
        customError.errorCode = errorCode;
        // También podemos adjuntar directamente los errores si existen para facilitar el acceso
        if (error.response?.data?.errors) {
          customError.errors = error.response.data.errors;
        }

        customError.toastHandled = toastHandled;
        return Promise.reject(customError);
      },
    );
  }

  public static getInstance(): ApiRequestManager {
    if (!ApiRequestManager.instance) {
      ApiRequestManager.instance = new ApiRequestManager();
    }
    return ApiRequestManager.instance;
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, config);
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, config);
  }

  public async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, config);
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete<T>(url, config);
  }

  public async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch<T>(url, data, config);
  }
}

export default ApiRequestManager;
