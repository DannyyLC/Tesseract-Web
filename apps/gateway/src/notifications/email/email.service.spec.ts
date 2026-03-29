import { EmailService } from './email.service';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  let loadTemplateSpy: jest.SpyInstance;
  const mockTransporter = { sendMail: jest.fn() } as any;
  const mockCreateTransport = (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

  const mockJwtService = {} as any;
  const mockPrismaService = { userVerification: { findFirst: jest.fn() } } as any;
  const mockLogger = { error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    loadTemplateSpy = jest
      .spyOn(EmailService.prototype as any, 'loadTemplate')
      .mockImplementation((...args: any[]) => {
        const templateName = String(args[0] ?? '');
        return (context: any) => {
          if (templateName.includes('request_services_info')) return `user_name: ${context.user_name}; user_email: ${context.user_email}`;
          if (templateName.includes('email_invitation_view')) return `inviteUrl: ${context.inviteUrl}; org: ${context.organizationName}`;
          if (templateName.includes('email_verification_view')) return `${context.verificationCode}`;
          if (templateName.includes('restore_password_es')) return `${context.verificationCode}`;
          if (templateName.includes('email_organization_exists')) return `${context.organizationName}`;
          return '';
        };
      });
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
    mockPrismaService.userVerification.findFirst.mockResolvedValue(null);
    service = new EmailService(mockJwtService, mockPrismaService, mockLogger);
  });

  afterEach(() => {
    loadTemplateSpy.mockRestore?.();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sendVerificationCodeByEmail returns sentMessageInfo and verificationCode on success', async () => {
    const sent = { messageId: 'm-1' };
    mockTransporter.sendMail.mockResolvedValue(sent);

    const payload = { email: 'test@example.com', userName: 'Tester' } as any;
    const result = await service.sendVerificationCodeByEmail(payload);

    expect(mockTransporter.sendMail).toHaveBeenCalled();
    expect(result).toHaveProperty('sentMessageInfo');
    expect(result.sentMessageInfo).toEqual(sent);
    expect(result.verificationCode).toHaveLength(6);
  });

  it('sendVerificationCodeByEmail returns null sentMessageInfo on transporter error', async () => {
    mockTransporter.sendMail.mockRejectedValue(new Error('smtp fail'));

    const payload = { email: 'fail@example.com', userName: 'Failer' } as any;
    const result = await service.sendVerificationCodeByEmail(payload);

    expect(mockTransporter.sendMail).toHaveBeenCalled();
    expect(result.sentMessageInfo).toBeNull();
    expect(result.verificationCode).toHaveLength(6);
  });

  it('sendServiceRequestEmail forwards fields to transporter', async () => {
    const sent = { messageId: 'srv-1' };
    mockTransporter.sendMail.mockResolvedValue(sent);

    const res = await service.sendServiceRequestEmail(
      'from@example.com',
      'to@example.com',
      'user@example.com',
      'User Name',
      'Subject X',
      'Please contact me',
      'Org Name',
      '2026-03-23',
    );

    expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: expect.stringContaining('Solicitud de Info'),
    }));
    expect(res).toEqual(sent);
  });

  it('sendServiceRequestEmail returns null on transporter error', async () => {
    mockTransporter.sendMail.mockRejectedValue(new Error('send fail'));
    const res = await service.sendServiceRequestEmail(
      'from@example.com',
      'to@example.com',
      'user@example.com',
      'User Name',
      'Subject X',
      'Please contact me',
      'Org Name',
      '2026-03-23',
    );
    expect(res).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('sendOrganizationInvitationToEmail returns sentMessageInfo and verificationCode on success', async () => {
    process.env.FRONTEND_URL = 'https://app.example';
    const sent = { messageId: 'inv-1' };
    mockTransporter.sendMail.mockResolvedValue(sent);

    const result = await service.sendOrganizationInvitationToEmail('invitee@example.com', 'OrgName');

    expect(mockTransporter.sendMail).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect((result as any).verificationCode).toHaveLength(6);
    expect((result as any).sentMessageInfo).toEqual(sent);
  });

  it('sendPasswordResetCodeByEmail returns data on success and null on failure', async () => {
    const sent = { messageId: 'pwd-1' };
    mockTransporter.sendMail.mockResolvedValue(sent);
    const ok = await service.sendPasswordResetCodeByEmail('user@example.com');
    expect(ok).not.toBeNull();
    expect((ok as any).verificationCode).toHaveLength(6);

    mockTransporter.sendMail.mockRejectedValueOnce(new Error('fail'));
    const fail = await service.sendPasswordResetCodeByEmail('user@example.com');
    expect(fail).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('sendOrganizationExistsEmail returns result on success and null on error', async () => {
    const sent = { messageId: 'exists-1' };
    mockTransporter.sendMail.mockResolvedValue(sent);
    const ok = await service.sendOrganizationExistsEmail('x@example.com', 'Org');
    expect(ok).toEqual(sent);

    mockTransporter.sendMail.mockRejectedValueOnce(new Error('err'));
    const res = await service.sendOrganizationExistsEmail('x@example.com', 'Org');
    expect(res).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('generateVerificationCode retries when duplicate found', async () => {
    // first call returns a duplicate, second returns null -> unique
    mockPrismaService.userVerification.findFirst.mockResolvedValueOnce({ id: 'dup' }).mockResolvedValueOnce(null);
    const code = await (service as any).generateVerificationCode();
    expect(mockPrismaService.userVerification.findFirst).toHaveBeenCalled();
    expect(code).toHaveLength(6);
  });

  it('constructor loads templates and creates transporter', () => {
    expect((nodemailer.createTransport as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(loadTemplateSpy).toHaveBeenCalled();
  });

  it('sendOrganizationInvitationToEmail returns null when transporter fails', async () => {
    mockTransporter.sendMail.mockRejectedValue(new Error('invite fail'));

    const result = await service.sendOrganizationInvitationToEmail('bad@example.com', 'Org');
    expect(result).toBeNull();
  });
});
