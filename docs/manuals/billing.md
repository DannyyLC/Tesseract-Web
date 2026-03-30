---
title: 'Facturación y Suscripciones (Stripe)'
description: 'Cómo funciona el motor de pagos, cambios de plan y consumo en Tesseract/Fractal.'
---

El sistema de facturación de Tesseract/Fractal está construido sobre **Stripe**. Está diseñado para manejar un modelo SaaS moderno con:

- Múltiples planes (Free, Starter, Pro).
- Facturación recurrente mensual.
- Sistema de créditos y consumo excedente (Overage).

## 1. El Flujo Principal (Checkout)

Se asume que **una Organización = un único Cliente en Stripe**. No se permite que una organización tenga múltiples suscripciones activas simultáneas.

### Crear una nueva suscripción

1. Cuando un usuario en el plan `FREE` decide hacer un Upgrade, el frontend llama al endpoint de cambio de plan.
2. El backend genera una **Checkout Session** en Stripe.
3. El frontend redirige al usuario a la URL de Stripe para ingresar su tarjeta.
4. Una vez completado, Stripe envía un evento por Webhook (`checkout.session.completed`) y el backend actualiza la base de datos local para reflejar la nueva suscripción activa.

<Tip>
Para evitar errores de "Suscripción no encontrada", el backend verifica si el usuario ya tiene un `stripeCustomerId` guardado. Si no lo tiene, lo crea *on-the-fly* antes de generar la Checkout Session.
</Tip>

## 2. Cambios de Plan (Downgrades y Upgrades)

El manejo de cambios de plan una vez que el usuario ya originó una suscripción de pago tiene reglas estrictas de negocio.

### Downgrades (Bajar a un plan más barato)

Los downgrades **no son inmediatos**. Si un usuario está en plan "Pro" y baja a "Starter" a mitad de mes, el sistema le respeta los días restantes por los que ya pagó.

- El backend crea un **Subscription Schedule** en Stripe.
- El cambio a "Starter" se programa para ejecutarse al final del ciclo de facturación actual (`period_end`).
- En la base de datos local, la suscripción se marca con un campo `pendingDowngradeTo`.
- La UI le muestra al usuario una advertencia indicando que el cambio se hará efectivo en su próxima fecha de corte.

### Upgrades (Subir a un plan más caro)

Los upgrades **son inmediatos**. El usuario paga la diferencia (prorrateada por Stripe) y obtiene acceso a las características del plan superior al instante.

- Si el usuario tenía un downgrade _programado_ (ej: de Pro iba a bajar a Starter el próximo mes) y decide hacer un Upgrade de nuevo, el sistema **cancela el Subscription Schedule** de Stripe y aplica el Upgrade inmediatamente.

### Cancelar una Suscripción

La cancelación total funciona igual que un downgrade. Se respeta el tiempo pagado y la suscripción se cancela al final del ciclo. El usuario regresa automáticamente al plan `FREE` con los limitantes que esto conlleva.

## 3. Webhooks & Sincronización

La fuente de la verdad para el estado de una suscripción **siempre es Stripe**. La base de datos local actúa como un caché o réplica rápida.

Los eventos más importantes que escucha nuestro webhook handler son:

- `customer.subscription.created`: Se activa el plan en la DB local.
- `customer.subscription.updated`: Se actualiza el plan, o se registran estados de mora si el pago falló.
- `customer.subscription.deleted`: El usuario regresa inmediatamente al plan `FREE`.

## 4. Consumo y Sistema de Créditos (Overage)

Tesseract incluye un sistema donde las ejecuciones de IA (Workflows) cuestan _créditos_.

### Límite Base vs Overage

Cada plan tiene un límite de tareas mensuales. Cuando un usuario se acerca al 100% de uso, se le bloquea la ejecución de nuevos workflows, **a menos que tenga activada la opción de "Overage"**.

El **Overage** permite consumir créditos extra que se cobrarán al final del mes en su factura de Stripe.

- La lógica del overage está ligada a un límite de gasto en USD fijado por la organización para no llevarse sorpresas.
- La UI incluye un control tipo _toggle_ para activar/desactivar este comportamiento.

<Card title="Pruebas Locales" icon="credit-card" href="/setup/stripe-local">
  Recuerda consultar la guía de pruebas locales para ver cómo simular estos comportamientos usando el CLI de Stripe.
</Card>
