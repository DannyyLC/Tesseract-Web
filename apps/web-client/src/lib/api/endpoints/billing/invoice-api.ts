import ApiRequestManager from '../../api-request-manager';
import {
  ApiResponse,
  DEFAULT_PAGE_SIZE,
  DashboardInvoiceDto,
  FiscalProfileDto,
  PaginatedResponse,
  UpsertFiscalProfileDto,
} from '@tesseract/types';

/**
 * Facturas y datos fiscales.
 *
 * Se separa de `BillingApi` porque cuelga de otras rutas del gateway (`/invoice` y
 * `/fiscal-profile`, no `/billing`) y porque solo aplica a organizaciones mexicanas.
 */
class InvoiceApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/invoice';
  private static FISCAL_URL = '/fiscal-profile';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /** GET /invoice/dashboard — histórico paginado por cursor. */
  public async list(
    cursor: string | null = null,
    pageSize = DEFAULT_PAGE_SIZE,
    action: 'next' | 'prev' | null = null,
  ): Promise<PaginatedResponse<DashboardInvoiceDto> | null> {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (cursor) params.set('cursor', cursor);
    if (action) params.set('action', action);

    const result = await this.apiRequestManager.get<
      ApiResponse<PaginatedResponse<DashboardInvoiceDto>>
    >(`${InvoiceApi.BASE_URL}/dashboard?${params.toString()}`);

    return result.data.data ?? null;
  }

  /**
   * GET /fiscal-profile
   *
   * Devuelve `null` cuando la organización todavía no ha llenado sus datos. Es un estado
   * normal —son opcionales—, no un error.
   */
  public async getFiscalProfile(): Promise<FiscalProfileDto | null> {
    const result = await this.apiRequestManager.get<ApiResponse<FiscalProfileDto | null>>(
      InvoiceApi.FISCAL_URL,
    );
    return result.data.data ?? null;
  }

  /** PUT /fiscal-profile — valida contra el padrón del SAT antes de guardar. */
  public async saveFiscalProfile(data: UpsertFiscalProfileDto): Promise<FiscalProfileDto> {
    const result = await this.apiRequestManager.put<ApiResponse<FiscalProfileDto>>(
      InvoiceApi.FISCAL_URL,
      data,
    );

    if (!result.data.data) {
      throw new Error('No data received from fiscal profile endpoint');
    }

    return result.data.data;
  }

  /** POST /invoice/:id/cfdi — genera el CFDI de una factura que quedó pendiente. */
  public async generateCfdi(invoiceId: string): Promise<void> {
    await this.apiRequestManager.post(`${InvoiceApi.BASE_URL}/${invoiceId}/cfdi`);
  }

  /**
   * Descarga el XML o el PDF del CFDI.
   *
   * Va por el gateway y no por una URL de GCS: el archivo lleva datos fiscales y la
   * autorización tiene que pasar por el token, no por un enlace que cualquiera pueda reenviar.
   */
  public async downloadCfdi(invoiceId: string, format: 'xml' | 'pdf'): Promise<Blob> {
    const result = await this.apiRequestManager.get<Blob>(
      `${InvoiceApi.BASE_URL}/${invoiceId}/cfdi/${format}`,
      { responseType: 'blob' },
    );
    return result.data;
  }
}

export default InvoiceApi;
