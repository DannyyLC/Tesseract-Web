import ApiRequestManager from '../../api_request_manager';

class ToolsOauthApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/tools/oauth';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Obtiene la URL de autorización de Google y redirige al usuario.
   * El backend construye la URL OAuth y devuelve un redirect.
   * Endpoint: GET /tools/oauth/google/auth-url?tenantToolId=...
   */
  public getGoogleAuthUrl(tenantToolId: string): string {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
    const params = new URLSearchParams({ tenantToolId });
    return `${base}${ToolsOauthApi.BASE_URL}/google/auth-url?${params.toString()}`;
  }

  /**
   * Redirige al flujo OAuth de Google directamente.
   */
  public redirectToGoogleAuth(tenantToolId: string): void {
    window.location.href = this.getGoogleAuthUrl(tenantToolId);
  }
}

export default ToolsOauthApi;
