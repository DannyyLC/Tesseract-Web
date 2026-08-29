import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CfdiErrorKind, CfdiStatus } from '@tesseract/database';
import { PrismaService } from '@/platform/database/prisma.service';
import { EmailService } from '@/messaging/notifications/email/email.service';
import { CfdiService } from './cfdi.service';
import { FacturapiClient } from './facturapi.client';

/**
 * Ventana de gracia antes de que el barrido toque una factura.
 *
 * Sirve para dos cosas distintas. Sobre una factura recién pagada, evita que el cron pise el
 * timbrado que el webhook está haciendo en ese mismo momento: dos llamadas concurrentes al PAC
 * son dos CFDI para un solo pago. Sobre una factura atascada en STAMPING, es el tiempo tras el
 * cual se da por muerto el proceso que la reclamó.
 */
const GRACE_PERIOD_MS = 60 * 60 * 1000;

/** Tope de facturas por barrido, para que una avería acumulada no dispare cientos de llamadas. */
const MAX_PER_RUN = 50;

export interface RetrySweepResult {
  attempted: number;
  stamped: number;
  failed: number;
}

@Injectable()
export class CfdiRetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfdiService: CfdiService,
    private readonly emailService: EmailService,
    private readonly facturapiClient: FacturapiClient,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Reintenta las facturas que quedaron sin timbrar y avisa por correo si algo sigue fallando.
   *
   * **No reintenta los fallos de tipo CLIENT_DATA.** Un RFC que no cuadra con el padrón del
   * SAT no se arregla solo: reintentarlo cada noche gasta llamadas al PAC y produce un correo
   * de alerta diario por algo que solo el cliente puede corregir desde su panel.
   */
  async retryPending(): Promise<RetrySweepResult> {
    // Apagados no basta con que `stampInvoice` salga sola: sin esta guarda el barrido consultaría
    // 50 facturas cada noche para no hacer nada con ellas, y el correo de alerta —que existe para
    // avisar de una avería real— se convertiría en ruido diario.
    if (!this.facturapiClient.isEnabled) {
      return { attempted: 0, stamped: 0, failed: 0 };
    }

    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const candidates = await this.prisma.invoice.findMany({
      where: {
        OR: [
          // Pendientes y fallos nuestros: el pago ya se asentó hace rato.
          {
            cfdiStatus: { in: [CfdiStatus.PENDING, CfdiStatus.FAILED] },
            cfdiErrorKind: { not: CfdiErrorKind.CLIENT_DATA },
            paidAt: { lt: cutoff },
          },
          // Reclamadas por un proceso que nunca terminó. `stampInvoice` no las tocaría —su
          // compare-and-swap solo acepta PENDING o FAILED—, así que se retoman aparte.
          {
            cfdiStatus: CfdiStatus.STAMPING,
            cfdiLastAttemptAt: { lt: cutoff },
          },
        ],
        organization: { country: 'MX' },
      },
      select: { id: true, cfdiStatus: true },
      orderBy: { paidAt: 'asc' },
      take: MAX_PER_RUN,
    });

    const result: RetrySweepResult = { attempted: 0, stamped: 0, failed: 0 };
    const causes = new Map<string, number>();

    for (const candidate of candidates) {
      result.attempted += 1;

      const outcome =
        candidate.cfdiStatus === CfdiStatus.STAMPING
          ? await this.cfdiService.resumeStalledInvoice(candidate.id)
          : await this.cfdiService.stampInvoice(candidate.id);

      if (outcome.status === 'stamped') {
        result.stamped += 1;
      } else if (outcome.status === 'failed') {
        result.failed += 1;
        const message = outcome.message ?? 'Error desconocido';
        causes.set(message, (causes.get(message) ?? 0) + 1);
      }
    }

    if (result.failed > 0) {
      await this.notifyFailures(result.failed, causes);
    }

    return result;
  }

  private async notifyFailures(failedCount: number, causes: Map<string, number>): Promise<void> {
    const targetEmail =
      this.configService.get<string>('BILLING_ALERTS_EMAIL') ??
      this.configService.get<string>('SUPPORT_EMAIL_TO');

    if (!targetEmail) {
      this.logger.error(
        'notifyFailures >> Hay facturas sin timbrar pero no hay BILLING_ALERTS_EMAIL configurado',
      );
      return;
    }

    const grouped = Array.from(causes.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count);

    await this.emailService.sendCfdiFailuresAlert(targetEmail, failedCount, grouped);
  }
}
