import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RootApi from '@/lib/api/endpoints/root-api';
import { UpsertFiscalProfileDto } from '@tesseract/types';

/** Histórico de facturas de la organización. */
export function useInvoices(cursor: string | null = null, action: 'next' | 'prev' | null = null) {
  return useQuery({
    queryKey: ['invoices', cursor, action],
    queryFn: async () => {
      const api = RootApi.getInstance().getInvoiceApi();
      return await api.list(cursor, 10, action);
    },
  });
}

/**
 * Datos fiscales de la organización.
 *
 * `enabled` permite no consultarlo en organizaciones no mexicanas, que no tienen nada que ver
 * aquí y recibirían un 409.
 */
export function useFiscalProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['fiscal-profile'],
    queryFn: async () => {
      const api = RootApi.getInstance().getInvoiceApi();
      return await api.getFiscalProfile();
    },
    enabled,
    // Cambia poco: los datos fiscales de una empresa son estables durante años.
    staleTime: 1000 * 60 * 10,
  });
}

export function useInvoiceMutations() {
  const queryClient = useQueryClient();

  const saveFiscalProfile = useMutation({
    mutationFn: async (data: UpsertFiscalProfileDto) => {
      const api = RootApi.getInstance().getInvoiceApi();
      return await api.saveFiscalProfile(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-profile'] });
      // El dashboard de billing expone `fiscalProfileComplete`, que decide si se muestra el
      // aviso antes de contratar.
      queryClient.invalidateQueries({ queryKey: ['billing', 'dashboard'] });
    },
  });

  const generateCfdi = useMutation({
    mutationFn: async (invoiceId: string) => {
      const api = RootApi.getInstance().getInvoiceApi();
      return await api.generateCfdi(invoiceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  /**
   * Descarga un CFDI y lo entrega al navegador.
   *
   * No puede ser un `<a href>` directo: el endpoint exige el token de sesión, que va en la
   * cabecera y no en la URL. Se descarga con el cliente HTTP y se dispara la descarga desde
   * un blob temporal.
   */
  const downloadCfdi = async (invoiceId: string, invoiceNumber: string, format: 'xml' | 'pdf') => {
    const api = RootApi.getInstance().getInvoiceApi();
    const blob = await api.downloadCfdi(invoiceId, format);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return { saveFiscalProfile, generateCfdi, downloadCfdi };
}
