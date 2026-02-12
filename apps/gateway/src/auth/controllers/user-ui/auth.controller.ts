import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiResponseBuilder } from '@workflow-automation/shared-types';
import { HttpStatusCode } from 'axios';
import { Request, Response } from 'express';
import * as nodemailer from 'nodemailer';
import {
  loginSwaggerDesc,
  logoutAllSwaggerDesc,
  logoutSwaggerDesc,
  meSwaggerDesc,
  refreshSwaggerDesc,
  setup2FASwaggerDesc,
  signupStepOneSwaggerDesc,
  signupStepThreeSwaggerDesc,
  signupStepTwoSwaggerDesc,
  verify2FASwaggerDesc
} from '../../../api_docs/controllers/auth';
import { StartVerificationFlowDto } from '../../../auth/dto/start-verification-flow.dto';
import { VerificationCodeDto } from '../../../auth/dto/verification-code.dto';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { CreateUserDto } from '../../../users/dto';
import { AuthService } from '../../auth.service';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { StepOneErrors, StepThreeErrors } from '../../dto/error-singup-codes.dto';
import { LoginDto } from '../../dto/login.dto';
import { Verify2FACodeDto } from '../../dto/verify-2fa-code.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TempTokenGuard } from '../../guards/temp-token.guard';

/**
 * AuthController maneja todos los endpoints de autenticación
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Inicia sesión con email y password
   *
   * Los tokens se establecen como cookies httpOnly (NO en el body)
   *
   * Body:
   *   {
   *     "email": "juan@example.com",
   *     "password": "password123"
   *   }
   *
   * Response: 200 OK
   *   {
   *     "user": {
   *       "id": "uuid",
   *       "name": "Juan Pérez",
   *       "email": "juan@example.com",
   *       "plan": "free",
   *       "isActive": true
   *     }
   *   }
   *
   * Cookies establecidas:
   *   - temp2FAToken: token temporal para 2FA (15 minutos)
   *
   * Errores:
   *   401 - Credenciales inválidas
   *   401 - Cuenta inactiva o eliminada
   */
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ 
   summary: 'User login with email and password',
    description: loginSwaggerDesc
  })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const responseBuilder = new ApiResponseBuilder();
    try {
      const result: any = await this.authService.login(loginDto);
      const isProduction = process.env.NODE_ENV === 'production';

      if (result.status === 'complete') {
        // Login directo (sin 2FA)
        const rememberMe = result.rememberMe || false;
        const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined; // 30 days if rememberMe, else Session

        response.cookie('accessToken', result.accessToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000,
          path: '/',
        });

        response.cookie('refreshToken', result.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          maxAge: refreshMaxAge,
          path: '/api/auth',
        });

        responseBuilder
          .setSuccess(true)
          .setStatusCode(HttpStatusCode.Ok)
          .setData(
           process.env.NODE_ENV === 'production' ?
              { user: result.user, rememberMe } :
              { user: result.user, rememberMe, accessToken: result.accessToken, refreshToken: result.refreshToken }
          )
          .setMessage('Login successful');
      } else if (result.status === '2fa_required') {
        // Requiere 2FA
        response.cookie('temp2FAToken', result.tempToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000,
          path: '/api/auth',
        });

        responseBuilder
          .setSuccess(true)
          .setStatusCode(HttpStatusCode.Ok)
          .setMessage('Credentials valid, proceed to 2FA verification')
          .setData({ require2FA: true });
      }

      response.statusCode = HttpStatus.OK;
      response.send(responseBuilder.build());
    } catch (error) {
      responseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.Unauthorized)
        .setMessage('Invalid credentials or account inactive');
      response.statusCode = HttpStatus.UNAUTHORIZED;
      response.send(responseBuilder.build());
    }
  }


  @Post('2fa/setup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Start 2FA setup',
    description: setup2FASwaggerDesc
  })
  async setup2FA(@CurrentUser() user: UserPayload, @Res() response: Response) {
    const responseBuilder = new ApiResponseBuilder();
    try {
      const result = await this.authService.setup2FA(user.sub);

      responseBuilder
        .setSuccess(true)
        .setStatusCode(HttpStatusCode.Ok)
        .setData(result)
        .setMessage('2FA setup initiated');

      response.statusCode = HttpStatus.OK;
      return response.send(responseBuilder.build());
    } catch (error) {
      responseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.InternalServerError)
        .setMessage('Error initiating 2FA setup');
      response.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      return response.send(responseBuilder.build());
    }
  }

  /**
   * POST /auth/refresh
   * Refresca el access token usando el refresh token de la cookie
   *
   * Lee el refreshToken desde la cookie (NO desde el body)
   *
   * Body: {} (vacío, no se necesita enviar nada)
   *
   * Response: 200 OK
   *   {
   *     "success": true
   *   }
   *
   * Cookies actualizadas:
   *   - accessToken: nuevo token (15 minutos)
   *   - refreshToken: nuevo token rotado (7 días)
   *
   * Nota: El refresh token antiguo se invalida (token rotation)
   *
   * Errores:
   *   401 - Refresh token inválido o expirado
   *   401 - Cookie refreshToken no encontrada
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: refreshSwaggerDesc
  })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    // Leer refreshToken desde la cookie
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token no encontrado en las cookies');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    // Determinar si estamos en producción
    const isProduction = process.env.NODE_ENV === 'production';
    const rememberMe = result.rememberMe || false;
    const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined;

    // Establecer nuevo accessToken
    response.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    // Establecer nuevo refreshToken (rotado)
    response.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: refreshMaxAge,
      path: '/api/auth',
    });

    return {
      success: true,
      rememberMe,
    };
  }

  /**
   * GET /auth/me
   * Obtiene la información del usuario autenticado
   *
   * El accessToken se lee automáticamente desde la cookie
   *
   * Headers: (ninguno requerido, la cookie se envía automáticamente)
   *
   * Response: 200 OK
   *   {
   *     "id": "uuid",
   *     "name": "Juan Pérez",
   *     "email": "juan@example.com",
   *     "plan": "free",
   *     "maxWorkflows": 10,
   *     "maxExecutionsPerDay": 100,
   *     "isActive": true,
   *     "region": "us-central",
   *     "metadata": {...}
   *   }
   *
   * Errores:
   *   401 - Token inválido o expirado
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user profile',
    description: meSwaggerDesc
  })
  getProfile(@CurrentUser() user: UserPayload) {
    return user;
  }

  /**
   * POST /auth/logout
   * Cierra sesión invalidando el refresh token y limpiando las cookies
   *
   * Lee el refreshToken desde la cookie y la elimina
   *
   * Headers: (ninguno requerido, las cookies se envían automáticamente)
   * Body: {} (vacío)
   *
   * Response: 200 OK
   *   {
   *     "message": "Sesión cerrada exitosamente"
   *   }
   *
   * Cookies eliminadas:
   *   - accessToken
   *   - refreshToken
   *   - temp2FAToken
   * Nota: Solo invalida el refresh token específico de esta sesión
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description: logoutSwaggerDesc
  })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    // Leer refreshToken desde la cookie
    const refreshToken = request.cookies?.refreshToken;

    if (refreshToken) {
      // Invalidar el refresh token en la base de datos
      await this.authService.logout(refreshToken);
    }

    // Limpiar las cookies
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/api/auth' });
    response.clearCookie('temp2FAToken', { path: '/api/auth' });

    return { message: 'Sesión cerrada exitosamente' };
  }

  /**
   * POST /auth/logout-all
   * Cierra sesión en todos los dispositivos
   * Invalida TODOS los refresh tokens del usuario y limpia las cookies
   *
   * Invalida todas las sesiones del usuario en todos los dispositivos
   *
   * Headers: (ninguno requerido, las cookies se envían automáticamente)
   *
   * Response: 200 OK
   *   {
   *     "message": "Sesión cerrada en todos los dispositivos"
   *   }
   *
   * Cookies eliminadas:
   *   - accessToken
   *   - refreshToken
   *   - temp2FAToken
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout from all devices',
    description: logoutAllSwaggerDesc
  })
  async logoutAll(
    @CurrentUser() user: UserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Invalidar TODOS los refresh tokens del usuario
    await this.authService.logoutAll(user.sub);

    // Limpiar las cookies de esta sesión
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/api/auth' });
    response.clearCookie('temp2FAToken', { path: '/api/auth' });

    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  @Post('verify2facode')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(TempTokenGuard)
  @ApiOperation({
    summary: 'Verify 2FA code',
    description: verify2FASwaggerDesc
  })
  async verify2FA(
    @CurrentUser() user: UserPayload,
    @Body() authCode: Verify2FACodeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    let result = null;
    const responseBuilder = new ApiResponseBuilder();
    try {
      result = await this.authService.verify2FACode(user, authCode.code2FA);
    } catch {
      responseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.InternalServerError)
        .setMessage('Error verifying 2FA code');
      response.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      response.send(responseBuilder.build());
      return;
    }

    if (result == null) {
      responseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.Unauthorized)
        .setMessage('Invalid 2FA code');
      response.statusCode = HttpStatus.UNAUTHORIZED;
      response.send(responseBuilder.build());
      return;
    }
    // Determinar si estamos en producción
    const isProduction = process.env.NODE_ENV === 'production';
    const rememberMe = result.rememberMe || false;
    const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined;

    // Establecer accessToken en cookie httpOnly
    response.cookie('accessToken', result.accessToken, {
      httpOnly: true, // No accesible desde JavaScript
      secure: isProduction, // Solo HTTPS en producción
      sameSite: 'strict', // Protección CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 horas - Wait, accessToken usually short? I'll keep it as was in verify2FA for now
      path: '/',
    });

    // Establecer refreshToken en cookie httpOnly
    response.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: refreshMaxAge, // Session or 30 days
      path: '/api/auth', // Solo se envía a endpoints de auth
    });

    // Retornar solo la info del usuario (NO los tokens)
    responseBuilder
      .setSuccess(true)
      .setStatusCode(HttpStatusCode.Ok)
      .setData({ user: result.user, rememberMe })
      .setMessage('2FA verified successfully');
    response.statusCode = 200;
    response.send(responseBuilder.build());
  }

  @Post('2fasignup-step-one')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Signup step 1: send verification email',
    description: signupStepOneSwaggerDesc
  })
  async signupStep1(
    @Body() payload: StartVerificationFlowDto,
    @Res() response: Response,
  ): Promise<
    Response<ApiResponseBuilder<nodemailer.SentMessageInfo | keyof typeof StepOneErrors>>
  > {
    const apiResponseBuilder = new ApiResponseBuilder<
      nodemailer.SentMessageInfo | keyof typeof StepOneErrors
    >();
    const result = await this.authService.signupStepOne(payload);

    if (typeof result !== 'string') {
      apiResponseBuilder
        .setSuccess(true)
        .setStatusCode(HttpStatusCode.Ok)
        .setData(result)
        .setMessage('Verification email sent successfully');
      response.statusCode = HttpStatus.OK;
      return response.send(apiResponseBuilder.build());
    } else {
      apiResponseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.InternalServerError)
        .setMessage('Error sending verification email')
        .setErrors([result]);
      response.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      return response.send(apiResponseBuilder.build());
    }
  }

  @Post('2fasignup-step-two')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Signup step 2: verify email code',
    description: signupStepTwoSwaggerDesc
  })
  async signupStep2(
    @Body() verificationCode: VerificationCodeDto,
    @Res() response: Response,
  ): Promise<Response<ApiResponseBuilder<boolean>>> {
    const responseBuilder = new ApiResponseBuilder<boolean>();
    const isEmailVerified = await this.authService.signupStepTwo(verificationCode);
    if (isEmailVerified) {
      responseBuilder
        .setSuccess(true)
        .setStatusCode(HttpStatusCode.Ok)
        .setData(true)
        .setMessage('Email verified successfully');
      response.statusCode = HttpStatus.OK;
      return response.send(responseBuilder.build());
    } else {
      responseBuilder
        .setSuccess(false)
        .setStatusCode(HttpStatusCode.BadRequest)
        .setData(false)
        .setMessage('Invalid or expired verification code');
      response.statusCode = HttpStatus.BAD_REQUEST;
      return response.send(responseBuilder.build());
    }
  }

  @Post('2fasignup-step-three')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Signup step 3: create user',
    description: signupStepThreeSwaggerDesc
  })
  async signupStep3(
    @Body() body: CreateUserDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponseBuilder<any | keyof typeof StepThreeErrors>>> {
    const apiResponse = new ApiResponseBuilder<any | keyof typeof StepThreeErrors>();
    const result = await this.authService.signupStepThree(body);
    if (typeof result === 'string') {
      apiResponse.setStatusCode(HttpStatusCode.BadRequest).setMessage('User registration failed').setErrors([result]);
      return res.status(HttpStatusCode.BadRequest).json(apiResponse.build());
    } else {
      // Determinar si estamos en producción
      const isProduction = process.env.NODE_ENV === 'production';

      // Login directo (es signup, default recuerdame false)
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        // maxAge: undefined, // Session cookie
        path: '/api/auth',
      });

      apiResponse
        .setStatusCode(HttpStatusCode.Created)
        .setMessage('User registered successfully')
        .setData({ user: result.user, rememberMe: false });
      return res.status(HttpStatusCode.Created).json(apiResponse.build());
    }
  }
}
