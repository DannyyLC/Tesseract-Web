# Configuración de Stripe Webhooks en Local (Desarrollo)

Para que tu entorno de desarrollo reciba notificaciones de pagos exitosos, cancelaciones, etc., necesitas reenviar los eventos de Stripe a tu servidor local.

## Comandos rápidos

1. **Inicia sesión en Stripe CLI:**

   ```bash
   stripe login
   ```

   _(Solo necesitas hacerlo una vez, o si tu sesión expiró)._

2. **Inicia el reenvío de webhooks:**
   Abre una nueva terminal y déjala corriendo con este comando:

   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

3. **Configura tu secreto (Secret):**
   Al correr el comando anterior, la consola imprimirá un **Webhook Secret** (inicia con `whsec_...`).
   Cópialo y pégalo en el `.env` raíz (donde lee tu contenedor de Docker):

   ```env
   STRIPE_WEBHOOK_SECRET=whsec_tu_secreto_aqui
   ```

4. **Aplica los cambios en Docker:**
   Debes recrear el contenedor para que tome el nuevo secreto de `.env`.
   ```bash
   docker compose up -d gateway
   ```
   _(No es necesario hacer `--build` si solo modificaste el `.env`)_.

---

**Nota:** Recuerda siempre dejar la terminal de `stripe listen` abierta mientras estés haciendo pruebas de pagos en local, de lo contrario los webhooks no llegarán a tu backend.

## Catálogo de precios

El gateway no lee Price IDs de variables de entorno: los resuelve por _lookup key_ (`starter_monthly`,
`pro_monthly`, `overage_credit`…) contra la API de Stripe. Antes de probar un cobro hay que crear
ese catálogo en tu cuenta de prueba:

```bash
pnpm stripe:catalog            # dry-run: imprime qué crearía o cambiaría
pnpm stripe:catalog --apply    # lo aplica
```

Cada precio lleva sus importes en USD y en MXN dentro del mismo objeto (`currency_options`), así
que el **Price ID es el mismo en ambas monedas** y la organización paga en la suya según su país.

Para cambiar un precio se edita `CATALOG` en `scripts/stripe/sync-catalog.ts` y se vuelve a correr:
no hace falta redeploy, porque no hay ninguna cifra de dinero compilada en el código. El gateway
cachea el catálogo cinco minutos, así que un cambio tarda eso en verse.

## Tarjetas de Prueba (Test Cards)

Mientras tu cuenta de Stripe esté en **Modo de Prueba (Test Mode)**, puedes usar estas tarjetas ficticias en lugar de una real:

| Tipo de Prueba           | Número de Tarjeta     | MM/AA                                | CVC                             | C.P.       |
| :----------------------- | :-------------------- | :----------------------------------- | :------------------------------ | :--------- |
| **Pago Exitoso (Visa)**  | `4242 4242 4242 4242` | Cualquier fecha futura (ej. `12/30`) | Cualquier 3 dígitos (ej. `123`) | Cualquiera |
| **Fondos Insuficientes** | `4000 0000 0000 0002` | Cualquier fecha futura               | Cualquiera                      | Cualquiera |
| **Tarjeta Rechazada**    | `4000 0000 0000 0005` | Cualquier fecha futura               | Cualquiera                      | Cualquiera |
