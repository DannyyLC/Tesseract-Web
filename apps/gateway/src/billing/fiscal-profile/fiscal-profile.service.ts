import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DEFAULT_CFDI_USE, FiscalProfileDto } from '@tesseract/types';
import { PrismaService } from '@/platform/database/prisma.service';
import {
  FiscalDataRejectedException,
  FiscalNotApplicableException,
} from '@/platform/common/exceptions';
import { FacturapiClient } from '../invoice/facturapi.client';
import { UpsertFiscalProfileDto } from './dto/upsert-fiscal-profile.dto';

/** País cuyas organizaciones reciben CFDI. */
const MEXICO = 'MX';

@Injectable()
export class FiscalProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facturapiClient: FacturapiClient,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Si esta organización recibe CFDI.
   *
   * Se mira `country`, que se escribe una sola vez en el checkout. En NULL significa que
   * todavía no ha contratado: no se le puede facturar, pero tampoco es un error — simplemente
   * no hay nada que emitir hasta que pase por caja.
   */
  async isMexican(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { country: true },
    });
    return organization?.country === MEXICO;
  }

  async get(organizationId: string): Promise<FiscalProfileDto | null> {
    const profile = await this.prisma.fiscalProfile.findUnique({
      where: { organizationId },
    });
    if (!profile) return null;

    return {
      rfc: profile.rfc,
      legalName: profile.legalName,
      zipCode: profile.zipCode,
      taxRegime: profile.taxRegime,
      cfdiUse: profile.cfdiUse,
      email: profile.email,
      validatedAt: profile.validatedAt,
    };
  }

  /**
   * Guarda los datos fiscales, previa validación contra el padrón del SAT.
   *
   * El orden importa: **primero se valida con el PAC y solo después se guarda**. El SAT
   * compara RFC, razón social y código postal contra su padrón al timbrar, así que unos datos
   * que no cuadran no producen una factura mala — producen que no haya factura. Descubrirlo
   * en este formulario, donde el cliente tiene la Constancia delante y puede corregir, es
   * barato; descubrirlo cuando ya pagó es una factura pendiente y un correo de soporte.
   *
   * Si el PAC rechaza, no se escribe nada: un perfil guardado sin validar aparentaría estar
   * bien en la interfaz y volvería a fallar en cada intento de timbrado.
   */
  async upsert(organizationId: string, dto: UpsertFiscalProfileDto): Promise<FiscalProfileDto> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { country: true },
    });

    if (organization?.country !== MEXICO) {
      throw new FiscalNotApplicableException(organization?.country ?? null);
    }

    const existing = await this.prisma.fiscalProfile.findUnique({
      where: { organizationId },
    });

    const customerData = {
      legal_name: dto.legalName,
      tax_id: dto.rfc,
      tax_system: dto.taxRegime,
      email: dto.email,
      address: { zip: dto.zipCode },
      default_invoice_use: dto.cfdiUse ?? DEFAULT_CFDI_USE,
    };

    const customerId = await this.syncFacturapiCustomer(
      existing?.facturapiCustomerId ?? null,
      customerData,
    );

    // La validación es explícita y no un efecto del alta: crear el customer en Facturapi no
    // consulta el padrón por sí solo.
    const validation = await this.facturapiClient.customers.validateTaxInfo(customerId);

    if (!validation.is_valid) {
      this.logger.warn(
        `upsert >> El SAT rechazó los datos fiscales de la organización ${organizationId}: ${JSON.stringify(
          validation.errors,
        )}`,
      );
      throw new FiscalDataRejectedException(validation.errors ?? []);
    }

    const saved = await this.prisma.fiscalProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        rfc: dto.rfc,
        legalName: dto.legalName,
        zipCode: dto.zipCode,
        taxRegime: dto.taxRegime,
        cfdiUse: dto.cfdiUse ?? DEFAULT_CFDI_USE,
        email: dto.email,
        facturapiCustomerId: customerId,
        validatedAt: new Date(),
      },
      update: {
        rfc: dto.rfc,
        legalName: dto.legalName,
        zipCode: dto.zipCode,
        taxRegime: dto.taxRegime,
        cfdiUse: dto.cfdiUse ?? DEFAULT_CFDI_USE,
        email: dto.email,
        facturapiCustomerId: customerId,
        validatedAt: new Date(),
      },
    });

    this.logger.info(`upsert >> Perfil fiscal validado y guardado para ${organizationId}`);

    return {
      rfc: saved.rfc,
      legalName: saved.legalName,
      zipCode: saved.zipCode,
      taxRegime: saved.taxRegime,
      cfdiUse: saved.cfdiUse,
      email: saved.email,
      validatedAt: saved.validatedAt,
    };
  }

  /**
   * Crea el receptor en Facturapi, o lo actualiza si ya existe.
   *
   * Si el id guardado ya no existe del otro lado —lo borraron desde el panel de Facturapi, o
   * la llave cambió de entorno entre sandbox y producción— se crea uno nuevo en vez de dejar
   * el perfil inservible. Es el único caso en que se traga el error de `update`.
   */
  private async syncFacturapiCustomer(
    existingCustomerId: string | null,
    data: Record<string, unknown>,
  ): Promise<string> {
    if (existingCustomerId) {
      try {
        const updated = await this.facturapiClient.customers.update(existingCustomerId, data);
        return updated.id;
      } catch (error) {
        this.logger.warn(
          `syncFacturapiCustomer >> No se pudo actualizar el customer ${existingCustomerId}, se creará uno nuevo: ${
            (error as Error).message
          }`,
        );
      }
    }

    const created = await this.facturapiClient.customers.create(data);
    return created.id;
  }
}
