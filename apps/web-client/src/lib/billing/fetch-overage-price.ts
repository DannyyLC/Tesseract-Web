import { BillingPlansResponse, formatMoney } from '@tesseract/types';

/**
 * Precio del crédito de overage en las dos monedas, para páginas renderizadas en el servidor.
 *
 * Los componentes de servidor no pueden usar hooks, así que la página de términos no puede
 * apoyarse en `useOveragePrice`. Y tampoco puede llevar el importe escrito a mano: es un
 * documento legal, y desde que el precio vive en Stripe una cifra fija empezaría a mentir en
 * cuanto alguien corriera `pnpm stripe:catalog`.
 *
 * `GET /billing/plans` es público, así que no hace falta autenticación. Si la llamada falla se
 * devuelve `null` y quien llame decide qué hacer: es preferible omitir la cifra a publicar una
 * equivocada en unas condiciones de servicio.
 *
 * No recibe el idioma de la página para formatear el importe: el formato del dinero (punto
 * decimal, coma de millar) sigue el mercado al que se factura, no el idioma de la UI — mismo
 * criterio que `useBillingCurrency`. `formatMoney` ya usa ese formato por default.
 */
export async function fetchOveragePriceLabel(): Promise<string | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

  try {
    const response = await fetch(`${baseUrl}/billing/plans`, {
      // Una hora: el documento no necesita reflejar un cambio de precio al instante, y así una
      // página legal muy visitada no golpea el gateway en cada carga.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const { overagePerCredit } = (await response.json()) as BillingPlansResponse;
    const { usd, mxn } = overagePerCredit;
    if (usd === undefined && mxn === undefined) return null;

    // Ambas monedas, porque la página es pública y no hay organización de la que deducir una.
    return [
      usd !== undefined ? `${formatMoney(usd, 'usd')} USD` : null,
      mxn !== undefined ? `${formatMoney(mxn, 'mxn')} MXN` : null,
    ]
      .filter(Boolean)
      .join(' / ');
  } catch {
    return null;
  }
}
