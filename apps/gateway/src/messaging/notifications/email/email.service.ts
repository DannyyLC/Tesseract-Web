import { Inject, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { StartVerificationFlowDto } from '@/identity/auth/dto/start-verification-flow.dto';
import { PrismaService } from '@/platform/database/prisma.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private emailVerificationTemplate: handlebars.TemplateDelegate;
  private emailInvitationTemplate: handlebars.TemplateDelegate;
  private emailPasswordResetTemplate: handlebars.TemplateDelegate;
  private emailOrganizationExistsTemplate: handlebars.TemplateDelegate;
  private emailServiceRequestTemplate: handlebars.TemplateDelegate;
  private cfdiFailuresAlertTemplate: handlebars.TemplateDelegate;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.transporter = nodemailer.createTransport(
      {
        host: process.env.SMTP_HOST ?? 'smtp-relay.brevo.com',
        port: Number(process.env.SMTP_PORT),
        secure: process.env.MAILER_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      } as nodemailer.TransportOptions,
      {
        from: {
          name: 'No-reply',
          address: process.env.SMTP_EMAIL_FROM ?? '',
        },
      },
    );

    this.emailVerificationTemplate = this.loadTemplate('email_verification_view.hbs');
    this.emailInvitationTemplate = this.loadTemplate('email_invitation_view.hbs');
    this.emailPasswordResetTemplate = this.loadTemplate('restore_password_es.hbs');
    this.emailOrganizationExistsTemplate = this.loadTemplate('email_organization_exists.hbs');
    this.emailServiceRequestTemplate = this.loadTemplate('request_services_info.hbs');
    this.cfdiFailuresAlertTemplate = this.loadTemplate('cfdi_failures_alert.hbs');
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    const templatesFolderPath = path.join(__dirname, './html_templates');
    const templatePath = path.join(templatesFolderPath, templateName);

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    return handlebars.compile(templateSource);
  }

  async sendVerificationCodeByEmail(
    payload: StartVerificationFlowDto,
  ): Promise<
    | { sentMessageInfo: nodemailer.SentMessageInfo; verificationCode: string }
    | { sentMessageInfo: null; verificationCode: string }
  > {
    const verificationCode = await this.generateVerificationCode();
    let sentMessageInfo: nodemailer.SentMessageInfo;
    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: payload.email,
        subject: 'Verificacion de Email',
        html: this.emailVerificationTemplate({
          verificationCode,
          name: payload.userName,
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `startVerificationEmailFlow >> Error enviando email a ${payload.email}: ${errorMessage}`,
      );
      return { sentMessageInfo: null, verificationCode };
    }

    return {
      sentMessageInfo,
      verificationCode,
    };
  }

  async sendOrganizationInvitationToEmail(
    email: string,
    organizationName: string,
  ): Promise<{ sentMessageInfo: nodemailer.SentMessageInfo; verificationCode: string } | null> {
    let sentMessageInfo: nodemailer.SentMessageInfo;
    const verificationCode = await this.generateVerificationCode();

    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: email,
        subject: `Invitación para unirte a ${organizationName}`,
        html: this.emailInvitationTemplate({
          inviteUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/accept-invitation?code=${verificationCode}&email=${encodeURIComponent(email)}`,
          organizationName,
        }),
      });
      return { sentMessageInfo, verificationCode };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `sendOrganizationInvitationToEmail >> Error enviando email a ${email}: ${errorMessage}`,
      );
      return null;
    }
  }

  private async generateVerificationCode(): Promise<string> {
    let verificationCode;
    let isVerificationCodeDuplicate;
    do {
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      isVerificationCodeDuplicate = await this.prisma.userVerification.findFirst({
        where: { verificationCode },
      });
    } while (isVerificationCodeDuplicate);
    return verificationCode;
  }

  async sendPasswordResetCodeByEmail(email: string): Promise<{
    sentMessageInfo: unknown;
    verificationCode: string;
  } | null> {
    const verificationCode = await this.generateVerificationCode();
    let sentMessageInfo: unknown;
    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: email,
        subject: 'Código de restablecimiento de contraseña',
        html: this.emailPasswordResetTemplate({
          verificationCode,
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `sendPasswordResetCodeByEmail >> Error enviando email a ${email}: ${errorMessage}`,
      );
      return null;
    }
    return { sentMessageInfo, verificationCode };
  }

  async sendOrganizationExistsEmail(email: string, organizationName: string): Promise<unknown> {
    try {
      return await this.transporter.sendMail({
        to: email,
        subject: `Invitación para unirte a ${organizationName}`,
        html: this.emailOrganizationExistsTemplate({
          organizationName,
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `sendOrganizationExistsEmail >> Error enviando email a ${email}: ${errorMessage}`,
      );
      return null;
    }
  }

  async sendServiceRequestEmail(
    fromEmail: string,
    targetEmail: string,
    userEmail: string,
    userName: string,
    subject: string,
    userMessage: string,
    organizationName: string,
    organizationId: string,
    date: string,
  ): Promise<unknown> {
    try {
      return await this.transporter.sendMail({
        from: fromEmail,
        to: targetEmail,
        subject: `Solicitud de Info: ${subject}`,
        html: this.emailServiceRequestTemplate({
          user_email: userEmail,
          user_name: userName,
          subject,
          user_message: userMessage,
          organization_name: organizationName,
          organization_id: organizationId,
          date,
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `sendServiceRequestEmail >> Error enviando email a ${targetEmail}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Aviso interno de facturas que no se pudieron timbrar.
   *
   * **Un correo por barrido, no uno por factura.** Los fallos de este tipo son de configuración
   * —CSD vencido, timbres agotados, PAC caído— y cuando ocurren fallan todas las facturas a la
   * vez. Cuarenta correos idénticos diciendo lo mismo se convierten en ruido que se filtra a
   * spam en la segunda semana, justo antes de que haga falta leerlos.
   *
   * Por eso recibe las causas ya agrupadas: cuántas facturas por cada mensaje de error.
   */
  async sendCfdiFailuresAlert(
    targetEmail: string,
    failedCount: number,
    causes: { message: string; count: number }[],
  ): Promise<unknown> {
    try {
      return await this.transporter.sendMail({
        to: targetEmail,
        subject: `[Tesseract] ${failedCount} factura(s) sin timbrar`,
        html: this.cfdiFailuresAlertTemplate({
          failed_count: failedCount,
          date: new Date().toLocaleDateString('es-MX'),
          causes: causes.map((cause) => ({ ...cause, isSingle: cause.count === 1 })),
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `sendCfdiFailuresAlert >> Error enviando email a ${targetEmail}: ${errorMessage}`,
      );
      return null;
    }
  }
}
