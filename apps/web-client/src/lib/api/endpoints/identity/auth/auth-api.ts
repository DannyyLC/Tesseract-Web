import ApiRequestManager from '../../../api-request-manager';
import {
  StartVerificationFlowDto,
  VerificationCodeDto,
  CreateUserDto,
  LoginDto,
  ResetPasswordDto,
  ChangePasswordDto,
  Verify2FACodeDto,
  Setup2FAResponse,
  BackupCodesResponse,
  ForgotPassDto,
  ApiResponse,
} from '@tesseract/types';

class AuthApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/auth';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public getGoogleAuthUrl(): string {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
    return `${baseUrl}${AuthApi.BASE_URL}/google`;
  }

  public async signupStepOne(
    verificationFlowDto: StartVerificationFlowDto,
  ): Promise<ApiResponse<any>> {
    const result = await this.apiRequestManager.post<ApiResponse<any>>(
      `${AuthApi.BASE_URL}/2fasignup-step-one`,
      verificationFlowDto,
    );

    return result.data;
  }

  public async signupStepTwo(verificationCodeDto: VerificationCodeDto): Promise<boolean> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${AuthApi.BASE_URL}/2fasignup-step-two`,
      verificationCodeDto,
    );
    return result.data?.data ?? false;
  }

  public async signupStepThree(signupDto: CreateUserDto): Promise<ApiResponse<any>> {
    const result = await this.apiRequestManager.post<ApiResponse<any>>(
      `${AuthApi.BASE_URL}/2fasignup-step-three`,
      signupDto,
    );
    return result.data.data;
  }

  public async login(loginDto: LoginDto): Promise<ApiResponse<any>> {
    const result = await this.apiRequestManager.post<ApiResponse<any>>(
      `${AuthApi.BASE_URL}/login`,
      loginDto,
    );
    return result.data;
  }

  public async verify2FACode(verify2FACodeDto: Verify2FACodeDto): Promise<ApiResponse<any>> {
    const result = await this.apiRequestManager.post<ApiResponse<any>>(
      `${AuthApi.BASE_URL}/verify2facode`,
      verify2FACodeDto,
    );
    return result.data;
  }

  /**
   * Inicia el alta de 2FA. El `code2FA` solo hace falta cuando el usuario ya
   * tiene 2FA activo y quiere sustituir su autenticador.
   */
  public async setup2FA(code2FA?: string): Promise<ApiResponse<Setup2FAResponse>> {
    const result = await this.apiRequestManager.post<ApiResponse<Setup2FAResponse>>(
      `${AuthApi.BASE_URL}/2fa/setup`,
      code2FA ? { code2FA } : {},
    );
    return result.data;
  }

  public async enable2FA(
    verify2FACodeDto: Verify2FACodeDto,
  ): Promise<ApiResponse<BackupCodesResponse>> {
    const result = await this.apiRequestManager.post<ApiResponse<BackupCodesResponse>>(
      `${AuthApi.BASE_URL}/2fa/enable`,
      verify2FACodeDto,
    );
    return result.data;
  }

  public async disable2FA(verify2FACodeDto: Verify2FACodeDto): Promise<ApiResponse<boolean>> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${AuthApi.BASE_URL}/2fa/disable`,
      verify2FACodeDto,
    );
    return result.data;
  }

  /** Emite un juego nuevo de códigos de respaldo e invalida los anteriores. */
  public async regenerateBackupCodes(
    verify2FACodeDto: Verify2FACodeDto,
  ): Promise<ApiResponse<BackupCodesResponse>> {
    const result = await this.apiRequestManager.post<ApiResponse<BackupCodesResponse>>(
      `${AuthApi.BASE_URL}/2fa/backup-codes/regenerate`,
      verify2FACodeDto,
    );
    return result.data;
  }

  public async resetPasswordStepOne(dto: ForgotPassDto): Promise<ApiResponse<boolean>> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${AuthApi.BASE_URL}/reset-password-step-one`,
      dto,
    );
    return result.data;
  }

  public async resetPasswordStepTwo(resetDto: ResetPasswordDto): Promise<ApiResponse<boolean>> {
    const result = await this.apiRequestManager.post<ApiResponse<boolean>>(
      `${AuthApi.BASE_URL}/reset-password-step-two`,
      resetDto,
    );
    return result.data;
  }

  public async changePassword(changePasswordDto: ChangePasswordDto): Promise<ApiResponse<any>> {
    const result = await this.apiRequestManager.post<ApiResponse<any>>(
      `${AuthApi.BASE_URL}/change-password`,
      changePasswordDto,
    );
    return result.data;
  }

  public async refreshToken(): Promise<boolean> {
    try {
      await this.apiRequestManager.post(`${AuthApi.BASE_URL}/refresh`);
      return true;
    } catch {
      return false;
    }
  }

  public async getMe(): Promise<any> {
    const result = await this.apiRequestManager.get<any>(`${AuthApi.BASE_URL}/me`);
    return result.data;
  }

  public async logout(): Promise<void> {
    await this.apiRequestManager.post<void>(`${AuthApi.BASE_URL}/logout`);
  }

  public async logoutAll(): Promise<void> {
    await this.apiRequestManager.post<void>(`${AuthApi.BASE_URL}/logout-all`);
  }
}

export default AuthApi;
