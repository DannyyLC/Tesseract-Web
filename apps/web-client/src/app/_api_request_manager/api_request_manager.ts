import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { toast } from 'sonner';

class ApiRequestManager {
  private static instance: ApiRequestManager;
  private axiosInstance: AxiosInstance;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api',
      timeout: 10000, // 10 seconds
      withCredentials: true, // Importante para enviar cookies httpOnly
    });

    // Optional: Add interceptors
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add auth token or other headers here
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
            // Si falla el refresh (token expirado o inválido), redirigimos al login
            // SOLO si no estamos ya en el login, signup, verify-2fa o forgot-password para evitar bucles
            if (
              typeof window !== 'undefined' &&
              window.location.pathname !== '/login' &&
              window.location.pathname !== '/signup' &&
              window.location.pathname !== '/verify-2fa' &&
              window.location.pathname !== '/forgot-password'
            ) {
              window.location.href = '/login';
            }
            return Promise.reject(refreshError);
          }
        }

        // ── Manejo centralizado de errores HTTP comunes ──
        // Se usa `id` para que sonner reemplace toasts duplicados en vez de apilarlos.
        // Se marca `toastHandled` para que los componentes sepan que ya se mostró un toast.
        let toastHandled = false;

        // 429 — Throttler / Rate Limit
        if (status === 429) {
          toast.error('Demasiadas solicitudes', {
            id: 'http-429',
            description: 'Espera un momento e intenta de nuevo.',
          });
          toastHandled = true;
        }

        // 403 — Forbidden / Sin permisos
        if (status === 403) {
          toast.error('Acceso denegado', {
            id: 'http-403',
            description: 'No tienes permisos para realizar esta acción.',
          });
          toastHandled = true;
        }

        // 500+ — Error interno del servidor
        if (status && status >= 500) {
          toast.error('Error del servidor', {
            id: 'http-500',
            description: 'Ocurrió un problema interno. Intenta de nuevo más tarde.',
          });
          toastHandled = true;
        }

        // Extraemos el mensaje de error del backend si existe
        const serverMessage = error.response?.data?.message || error.response?.data?.error;
        const finalMessage = serverMessage || error.message || 'Ocurrió un error inesperado';

        // Creamos un error personalizado que incluye la respuesta completa para acceder a campos específicos como 'errors'
        const customError: any = new Error(finalMessage);
        customError.response = error.response;
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
