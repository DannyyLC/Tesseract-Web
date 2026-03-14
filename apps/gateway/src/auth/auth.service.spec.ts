import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../notifications/email/email.service';
import { UtilityService } from '../utility/utility.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { UnauthorizedException, NotFoundException, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { StepOneErrors, StepThreeErrors, ForgotPassErrors } from './dto';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

jest.mock('bcrypt');
jest.mock('speakeasy');
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('mock-qr-code-url'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let emailService: EmailService;
  let utilityService: UtilityService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    userVerification: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    refreshToken: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'JWT_SECRET') return 'secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret';
      if (key === 'JWT_EXPIRATION_TIME') return '15m';
      if (key === 'JWT_REFRESH_EXPIRATION_TIME') return '7d';
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      return null;
    }),
  };

  const mockEmailService = {
    sendTemplateEmail: jest.fn().mockResolvedValue(true),
    sendVerificationCodeByEmail: jest.fn(),
    sendPasswordResetCodeByEmail: jest.fn(),
  };

  const mockUtilityService = {
    generateRandomString: jest.fn().mockReturnValue('random-string'),
    hashPassword: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: UtilityService, useValue: mockUtilityService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
    utilityService = module.get<UtilityService>(UtilityService);

    jest.clearAllMocks();
  });

  describe('Authentication (login, logout, logoutAll)', () => {
    const mockUser = {
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      role: 'admin',
      twoFactorEnabled: false,
    };
    const mockOrg = { id: 'org1', name: 'Org 1' };

    describe('login', () => {
      it('should return complete status and tokens if 2FA is disabled', async () => {
        jest.spyOn(service, 'validateUser').mockResolvedValue({ user: mockUser as any, organization: mockOrg as any });
        jest.spyOn(service, 'generateTokens').mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' });
        
        const result = await service.login({ email: 'test@test.com', password: 'pwd', rememberMe: false });
        
        expect(service.validateUser).toHaveBeenCalledWith('test@test.com', 'pwd');
        expect(service.generateTokens).toHaveBeenCalledWith('u1', 'test@test.com', 'Test', 'admin', 'org1', false);
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { lastLoginAt: expect.any(Date) }
        });
        expect(result).toEqual({
          status: 'complete',
          user: expect.objectContaining({ id: 'u1', email: 'test@test.com' }),
          accessToken: 'acc',
          refreshToken: 'ref'
        });
      });

      it('should return 2fa_required and tempToken if 2FA is enabled', async () => {
        const user2fa = { ...mockUser, twoFactorEnabled: true };
        jest.spyOn(service, 'validateUser').mockResolvedValue({ user: user2fa as any, organization: mockOrg as any });
        jest.spyOn(service, 'generateTempToken').mockReturnValue('temp-jwt-token');
        
        const result = await service.login({ email: 'test@test.com', password: 'pwd' });
        
        expect(result).toEqual({ status: '2fa_required', tempToken: 'temp-jwt-token' });
        expect(service.generateTempToken).toHaveBeenCalled();
      });
    });

    describe('logout and logoutAll', () => {
      it('should logout by revoking the specific refresh token', async () => {
        mockJwtService.decode.mockReturnValue({ sub: 'u1', email: 'test@test.com' });
        // Mock token in DB
        prisma.refreshToken.findMany = jest.fn().mockResolvedValue([{ id: 'rt1', tokenHash: 'hash1' }]);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await service.logout('raw-refresh-token');

        expect(bcrypt.compare).toHaveBeenCalledWith('raw-refresh-token', 'hash1');
        expect(prisma.refreshToken.update).toHaveBeenCalledWith({
          where: { id: 'rt1' },
          data: { revokedAt: expect.any(Date), revokedReason: 'logout' }
        });
        expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      });

      it('should throw Unauthorized on logout if jwt decode fails', async () => {
        mockJwtService.decode.mockReturnValue(null);
        await expect(service.logout('invalid')).rejects.toThrow(UnauthorizedException);
      });

      it('should invalidate all refresh tokens on logoutAll', async () => {
        await service.logoutAll('u1');
        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { userId: 'u1', revokedAt: null },
          data: { revokedAt: expect.any(Date), revokedReason: 'logout_all' }
        });
      });
    });
  });

  describe('Validations (validateUser, validateGoogleUser)', () => {
    const validOrg = { id: 'org1', name: 'Org 1', isActive: true };
    const validUser = {
      id: 'u1',
      email: 'test@example.com',
      password: 'hashedpassword',
      isActive: true,
      deletedAt: null,
      organization: validOrg,
    };

    describe('validateUser', () => {
      it('should throw UnauthorizedException if user not found', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if user has no organization', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ ...validUser, organization: null });
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if user has no password', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ ...validUser, password: null });
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if password does not match', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(validUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if user is inactive', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ ...validUser, isActive: false });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if organization is inactive', async () => {
        const inactiveOrgUser = { ...validUser, organization: { ...validOrg, isActive: false } };
        prisma.user.findUnique = jest.fn().mockResolvedValue(inactiveOrgUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        await expect(service.validateUser('test@example.com', 'pwd')).rejects.toThrow(UnauthorizedException);
      });

      it('should return user and organization if valid', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(validUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        const result = await service.validateUser('test@example.com', 'pwd');
        expect(result).toEqual({ user: validUser, organization: validOrg });
      });
    });

    describe('validateGoogleUser', () => {
      const googleDetails = {
        email: 'google@example.com',
        firstName: 'John',
        lastName: 'Doe',
        googleId: 'g123',
        avatar: 'avatar.png',
      };

      it('should update user with googleId if user exists but has no googleId', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({
          id: 'u-google',
          email: 'google@example.com',
          googleId: null,
          deletedAt: null,
          organization: validOrg,
        });
        prisma.user.update = jest.fn().mockResolvedValue({
          id: 'u-google',
          googleId: 'g123',
          organization: validOrg,
        });

        const result = await service.validateGoogleUser(googleDetails);
        expect(prisma.user.update).toHaveBeenCalled();
        expect(result.user.googleId).toBe('g123');
      });

      it('should reactivate user and create new org if user is soft deleted', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({
          id: 'u-deleted',
          email: 'google@example.com',
          deletedAt: new Date(),
          organization: validOrg,
        });

        // Mock transaction
        prisma.$transaction = jest.fn().mockImplementation(async (cb) => {
          // Providing a stub transaction object
          const mockTx = {
            organization: { create: jest.fn().mockResolvedValue({ id: 'new-org-id', name: "John's Organization" }) },
            creditBalance: { create: jest.fn().mockResolvedValue(true) },
            user: { update: jest.fn().mockResolvedValue({ id: 'u-deleted', organization: { id: 'new-org-id' } }) }
          };
          jest.spyOn(require('../organizations/organizations.service').OrganizationsService, 'generateUniqueSlug')
            .mockResolvedValue('john-s-organization');
          return await cb(mockTx);
        });

        const result = await service.validateGoogleUser(googleDetails);
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(result.user.id).toBe('u-deleted');
      });

      it('should magically create user, org, and balance if user does not exist', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);

        prisma.$transaction = jest.fn().mockImplementation(async (cb) => {
          const mockTx = {
            organization: { create: jest.fn().mockResolvedValue({ id: 'new-org-id', name: "John's Organization" }) },
            creditBalance: { create: jest.fn().mockResolvedValue(true) },
            user: { create: jest.fn().mockResolvedValue({ id: 'new-user', googleId: 'g123' }) }
          };
          jest.spyOn(require('../organizations/organizations.service').OrganizationsService, 'generateUniqueSlug')
            .mockResolvedValue('john-s-organization');
          return await cb(mockTx);
        });

        const result = await service.validateGoogleUser(googleDetails);
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(result.user.id).toBe('new-user');
      });
    });
  });

  describe('Token Management (generateTokens, refreshTokens)', () => {
    it('should generate both tokens and save refresh token to db', async () => {
      mockUtilityService.hashPassword.mockResolvedValue('hashed-refresh-token');
      const result = await service.generateTokens('u1', 'test@test.com', 'Test', 'admin', 'org1');
      
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2); // Access and refresh
      expect(mockUtilityService.hashPassword).toHaveBeenCalledWith('mock-jwt-token');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          tokenHash: 'hashed-refresh-token',
        }),
      }));
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    describe('refreshTokens', () => {
      it('should refresh tokens if token is valid and found', async () => {
        const mockPayload = { sub: 'u1', email: 'test@test.com', name: 'Test', role: 'admin', organizationId: 'org1', rememberMe: false };
        mockJwtService.verify.mockReturnValue(mockPayload);
        prisma.refreshToken.findMany = jest.fn().mockResolvedValue([{ id: 'rt1', tokenHash: 'hash1' }]);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        jest.spyOn(service, 'generateTokens').mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

        const result = await service.refreshTokens('valid-refresh');

        expect(service.generateTokens).toHaveBeenCalledWith('u1', 'test@test.com', 'Test', 'admin', 'org1', false);
        expect(prisma.refreshToken.update).toHaveBeenCalledWith({
          where: { id: 'rt1' },
          data: { revokedAt: expect.any(Date), revokedReason: 'token_rotated' }
        });
        expect(result).toEqual({ accessToken: 'new-acc', refreshToken: 'new-ref', rememberMe: false });
      });

      it('should throw Unauthorized if token verification fails', async () => {
        mockJwtService.verify.mockImplementation(() => { throw new Error('Invalid'); });
        await expect(service.refreshTokens('invalid')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw Unauthorized if no matching token found in DB', async () => {
        mockJwtService.verify.mockReturnValue({ sub: 'u1' });
        prisma.refreshToken.findMany = jest.fn().mockResolvedValue([]);
        await expect(service.refreshTokens('valid')).rejects.toThrow(UnauthorizedException);
      });

      it('should throw Unauthorized if hash compare fails', async () => {
        mockJwtService.verify.mockReturnValue({ sub: 'u1' });
        prisma.refreshToken.findMany = jest.fn().mockResolvedValue([{ id: 'rt1', tokenHash: 'hash1' }]);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        await expect(service.refreshTokens('valid')).rejects.toThrow(UnauthorizedException);
      });
    });
  });

  describe('2FA Flows (setup2FA, enable2FA, verify2FACode)', () => {
    it('should setup 2FA by generating secret and QR', async () => {
      (speakeasy.generateSecret as jest.Mock).mockReturnValue({ base32: 'secret32', otpauth_url: 'otpurl' });
      const result = await service.setup2FA('u1');
      
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { twoFactorSecret: 'secret32', twoFactorEnabled: false }
      });
      expect(result).toEqual({ qr: 'mock-qr-code-url' });
    });

    it('should enable 2FA if code is verified', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', twoFactorSecret: 'secret32' });
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);

      const result = await service.enable2FA('u1', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { twoFactorEnabled: true }
      });
      expect(result).toBe(true);
    });

    it('should fail to enable 2FA if code is invalid', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', twoFactorSecret: 'secret32' });
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      const result = await service.enable2FA('u1', '000000');
      expect(result).toBe(false);
    });

    describe('verify2FACode', () => {
      const mockPayload = { sub: 'u1', email: 'test@test.com', name: 'Test', role: 'admin', organizationId: 'org1' };
      
      it('should verify code, update user, and return tokens', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', email: 'test@test.com', twoFactorSecret: 'secret32' });
        prisma.organization.findUnique = jest.fn().mockResolvedValue({ id: 'org1', name: 'Org 1', plan: 'free' });
        (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
        jest.spyOn(service, 'generateTokens').mockResolvedValue({ accessToken: 'acc2fa', refreshToken: 'ref2fa' });

        const result = await service.verify2FACode(mockPayload as any, '123456');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { twoFactorEnabled: true }
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { lastLoginAt: expect.any(Date) }
        });
        expect(result).toMatchObject({
          user: { id: 'u1', email: 'test@test.com' },
          organization: { id: 'org1', name: 'Org 1' },
          accessToken: 'acc2fa',
          refreshToken: 'ref2fa'
        });
      });

      it('should return null if code is invalid', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', twoFactorSecret: 'secret32' });
        prisma.organization.findUnique = jest.fn().mockResolvedValue({ id: 'org1' });
        (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

        const result = await service.verify2FACode(mockPayload as any, '000000');
        expect(result).toBeNull();
      });
    });
  });

  describe('Signup Flows (signupStepOne, Two, Three)', () => {
    describe('signupStepOne', () => {
      const payload = { email: 'new@test.com', organizationName: 'Org', userName: 'New', password: 'pwd' };
      
      it('should return EMAIL_ALREADY_EXISTS if email active', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', deletedAt: null });
        const result = await service.signupStepOne(payload);
        expect(result).toBe(StepOneErrors.EMAIL_ALREADY_EXISTS);
      });

      it('should return ALREADY_IN_PROGRESS if verification exists', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue({ id: 'v1' });
        const result = await service.signupStepOne(payload);
        expect(result).toBe(StepOneErrors.ALREADY_IN_PROGRESS);
      });

      it('should return TRANSPORTER_ERROR if email fails', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        mockEmailService.sendVerificationCodeByEmail.mockResolvedValue({ sentMessageInfo: { success: false } });
        
        const result = await service.signupStepOne(payload);
        expect(result).toBe(StepOneErrors.TRANSPORTER_ERROR);
      });

      it('should create verification row and return sentMessageInfo', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        prisma.userVerification.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
        const mockSentInfo = { success: true, messageId: '123' };
        mockEmailService.sendVerificationCodeByEmail.mockResolvedValue({ sentMessageInfo: mockSentInfo, verificationCode: '123456' });
        prisma.userVerification.create = jest.fn().mockResolvedValue({ id: 'v1' });

        const result = await service.signupStepOne(payload);
        
        expect(prisma.userVerification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ email: 'new@test.com', verificationCode: '123456' })
        });
        expect(result).toEqual(mockSentInfo);
      });
    });

    describe('signupStepTwo', () => {
      it('should return true if code verified', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue({ id: 'v1' });
        prisma.userVerification.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        const result = await service.signupStepTwo({ email: 'new@test.com', verificationCode: '123456' });
        expect(result).toBe(true);
      });

      it('should return false if code incorrect or expired', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        const result = await service.signupStepTwo({ email: 'new@test.com', verificationCode: '000000' });
        expect(result).toBe(false);
      });
    });

    describe('signupStepThree', () => {
      const payload = { email: 'new@test.com', name: 'New', password: 'pwd', companyName: 'Org' };
      
      it('should return EMAIL_NOT_VERIFIED if not verified', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        const result = await service.signupStepThree(payload as any);
        expect(result).toBe(StepThreeErrors.EMAIL_NOT_VERIFIED);
      });

      it('should create organization, balance, and user via transaction', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue({ email: 'new@test.com', isEmailVerified: true, organizationName: 'Org', userName: 'New' });
        mockUtilityService.hashPassword.mockResolvedValue('hashed');
        
        prisma.$transaction = jest.fn().mockImplementation(async (cb) => {
          const mockTx = {
            organization: { create: jest.fn().mockResolvedValue({ id: 'org2', name: "Org" }) },
            creditBalance: { create: jest.fn().mockResolvedValue(true) },
            user: { 
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'u2', email: 'new@test.com', name: 'New', role: 'owner' }),
              update: jest.fn().mockResolvedValue(true)
            },
            userVerification: { deleteMany: jest.fn() }
          };
          jest.spyOn(require('../organizations/organizations.service').OrganizationsService, 'generateUniqueSlug')
            .mockResolvedValue('org');
          return await cb(mockTx);
        });
        jest.spyOn(service, 'generateTokens').mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

        const result = await service.signupStepThree(payload as any);
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('accessToken');
      });
    });
  });

  describe('Password Management (resetPassword, changePassword)', () => {
    describe('resetPasswordStepOne', () => {
      it('should return EMAIL_NOT_REGISTERED if user missing', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue(null);
        const result = await service.resetPasswordStepOne('test@test.com');
        expect(result).toBe(ForgotPassErrors.EMAIL_NOT_REGISTERED);
      });

      it('should store verification and return sent info', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', name: 'Test', organization: { name: 'Org' } });
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        mockEmailService.sendPasswordResetCodeByEmail.mockResolvedValue({ sentMessageInfo: { success: true }, verificationCode: '123' });
        prisma.userVerification.create = jest.fn().mockResolvedValue(true);

        const result = await service.resetPasswordStepOne('test@test.com');
        expect(prisma.userVerification.create).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
      });
    });

    describe('resetPasswordStepTwo', () => {
      it('should return VERIFICATION_CODE_INVALID if not found', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue(null);
        const result = await service.resetPasswordStepTwo('123', 'newpwd');
        expect(result).toBe(ForgotPassErrors.VERIFICATION_CODE_INVALID);
      });

      it('should update password and revoke tokens', async () => {
        prisma.userVerification.findFirst = jest.fn().mockResolvedValue({ email: 'test@test.com' });
        mockUtilityService.hashPassword.mockResolvedValue('hashed2');
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1' });
        jest.spyOn(service, 'logoutAll').mockResolvedValue({} as any);

        const result = await service.resetPasswordStepTwo('123', 'newpwd');
        
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { email: 'test@test.com' },
          data: { password: 'hashed2' }
        });
        expect(service.logoutAll).toHaveBeenCalledWith('u1');
        expect(result).toBe(true);
      });
    });

    describe('changePassword', () => {
      it('should require current password if user has one', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', password: 'old', twoFactorEnabled: false });
        await expect(service.changePassword('u1', { newPassword: 'new' })).rejects.toThrow(BadRequestException);
      });

      it('should reject if current password is wrong', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', password: 'old', twoFactorEnabled: false });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        await expect(service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'new' })).rejects.toThrow(UnauthorizedException);
      });

      it('should reject if 2FA code is missing when 2fa enabled', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', password: 'old', twoFactorEnabled: true, twoFactorSecret: 'abc' });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        await expect(service.changePassword('u1', { currentPassword: 'old', newPassword: 'new' })).rejects.toThrow(ForbiddenException);
      });

      it('should change password successfully', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', password: 'old', twoFactorEnabled: false });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockUtilityService.hashPassword.mockResolvedValue('newhashed');
        jest.spyOn(service, 'logoutAll').mockResolvedValue({} as any);

        const result = await service.changePassword('u1', { currentPassword: 'old', newPassword: 'new' });
        
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { password: 'newhashed' }
        });
        expect(service.logoutAll).toHaveBeenCalledWith('u1');
        expect(result).toHaveProperty('message');
      });
    });
  });

});
