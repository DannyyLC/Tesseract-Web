-- País de facturación de la organización (ISO 3166-1 alpha-2). Determina la moneda con la que
-- se le cobra. Nullable a propósito y sin default: no queremos anclar a nadie a una moneda por
-- omisión, así que se pide explícitamente en el checkout y las organizaciones que aún no
-- contratan se quedan en NULL.
ALTER TABLE "organizations" ADD COLUMN     "country" TEXT;

-- Moneda de la suscripción, tomada de la factura de Stripe. El default cubre a las filas
-- existentes, que son todas anteriores a la facturación regionalizada y por tanto en USD.
ALTER TABLE "subscriptions" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'usd';
