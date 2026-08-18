import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: la organización no es mexicana
 * El CFDI es un documento del SAT; fuera de México no aplica.
 */
export class FiscalNotApplicableException extends AppException {
  constructor(country: string | null) {
    super(
      ErrorCode.FISCAL_NOT_APPLICABLE,
      'Fiscal invoicing (CFDI) is only available for Mexican organizations',
      HttpStatus.CONFLICT,
      { country },
    );
  }
}

/**
 * Excepción: el SAT rechazó los datos fiscales
 *
 * Es el error que más se va a ver. El SAT compara RFC, razón social y código postal contra su
 * padrón, y basta una letra de diferencia con la Constancia de Situación Fiscal para que
 * rechace. `errors` trae el detalle campo por campo que devuelve el PAC, y hay que enseñárselo
 * al cliente: sin él, "datos inválidos" no le dice qué corregir.
 */
export class FiscalDataRejectedException extends AppException {
  constructor(errors: { path: string; message: string }[]) {
    super(
      ErrorCode.FISCAL_DATA_REJECTED,
      'The SAT rejected the fiscal data. Check that it matches your Constancia de Situación Fiscal exactly.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { errors },
    );
  }
}

/**
 * Excepción: no hay datos fiscales validados
 * Se lanza al pedir el timbrado de una factura de una organización que aún no los ha llenado.
 */
export class FiscalProfileMissingException extends AppException {
  constructor(organizationId: string) {
    super(
      ErrorCode.FISCAL_PROFILE_MISSING,
      'The organization has no validated fiscal profile',
      HttpStatus.CONFLICT,
      { organizationId },
    );
  }
}

/**
 * Excepción: la factura no se puede timbrar desde su estado actual
 *
 * Cubre dos casos distintos a propósito: la factura ya está timbrada (y volver a hacerlo
 * emitiría un segundo CFDI para un solo pago) o hay otro proceso timbrándola ahora mismo.
 */
export class CfdiNotStampableException extends AppException {
  constructor(invoiceId: string, status: string) {
    super(
      ErrorCode.CFDI_NOT_STAMPABLE,
      `Invoice cannot be stamped from status "${status}"`,
      HttpStatus.CONFLICT,
      { invoiceId, status },
    );
  }
}

/** Excepción: se pidió el XML o el PDF de una factura que no está timbrada. */
export class CfdiNotFoundException extends AppException {
  constructor(invoiceId: string) {
    super(
      ErrorCode.CFDI_NOT_FOUND,
      'No stamped CFDI found for this invoice',
      HttpStatus.NOT_FOUND,
      { invoiceId },
    );
  }
}
