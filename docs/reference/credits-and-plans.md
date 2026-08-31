---
title: 'Creditos y Planes'
description: 'Referencia completa de planes, creditos, limites y costos de overage del sistema de facturacion.'
---

El sistema de creditos es el motor economico de Tesseract. Cada ejecucion de un Workflow consume creditos del balance mensual de la organizacion.

**Los limites** salen de `packages/types/src/billing/subscriptions/plans.ts`. **Los precios no estan ahi**: viven unicamente en Stripe y se resuelven en vivo con `GET /billing/plans`. El unico lugar del repo que los declara es `scripts/stripe/sync-catalog.ts`, que es lo que se sincroniza contra Stripe.

---

## 1. Tabla de Planes

| Plan           | Precio/mes MXN | Precio/mes USD | Creditos/mes  | Usuarios  | Workflows | API Keys  | Datasets  | Filas     |
| -------------- | -------------- | -------------- | ------------- | --------- | --------- | --------- | --------- | --------- |
| **Free**       | $0             | $0             | 0             | 1         | 3         | 3         | 1         | 100       |
| **Starter**    | $499           | $25            | 750           | 10        | 10        | 50        | 3         | 1,000     |
| **Growth**     | $1,590         | $79            | 2,550         | 25        | 25        | 100       | 10        | 5,000     |
| **Business**   | $3,990         | $199           | 6,900         | 50        | 100       | 250       | 25        | 15,000    |
| **Pro**        | $9,990         | $499           | 18,750        | 100       | 250       | 500       | 50        | 50,000    |
| **Enterprise** | Personalizado  | Personalizado  | Personalizado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

> El plan **Free** no incluye creditos mensuales. Solo permite usar el dashboard y crear hasta 3 Workflows sin ejecutarlos con IA.

### Moneda de cobro

La moneda la decide el pais de facturacion de la organizacion (`Organization.country`, resuelto por `resolveBillingCurrency` en `packages/types/src/platform/common/countries.ts`): **Mexico se cobra en MXN, el resto de los paises admitidos en USD** (LATAM, US, CA, ES). Sin pais aun —organizaciones que nunca han pasado por checkout— se asume USD.

Los importes en pesos **no son la conversion** de los de dolares: son un punto de precio propio para el mercado mexicano. Cambiar uno no obliga a tocar el otro. En Stripe ambos viven en el mismo objeto `Price` via `currency_options`, asi que el Price ID que llega en una factura es el mismo se cobre en la moneda que se cobre.

La columna **Filas** es el total sumado entre todos los datasets de la organizacion, no por dataset. El maximo de columnas por dataset es 30 en todos los planes (`MAX_DATASET_FIELDS`), a proposito: no es una palanca comercial sino el punto en el que el LLM empieza a elegir mal los filtros.

De los dos limites de datasets, **el que cobra el costo real es Filas**; el conteo de catalogos se reparte con la mano suelta porque un dataset vacio no cuesta nada. Partir un catalogo en varios no consume ni una fila mas, y evita el patron que degrada la herramienta: meter lineas de negocio que no se parecen en una sola tabla, donde las 30 columnas se las come la union de todos los esquemas y se pierde el aislamiento por token —cada tool de dataset tiene alcance de UNO solo, y es lo unico que impide que un agente lea filas que no le tocan. La recomendacion de producto es **un dataset por esquema**: si dos lineas comparten columnas, se fusionan con una columna `select` que las distinga; si no, van separadas.

---

## 2. Categorias de Workflow y Costo en Creditos

Cada Workflow tiene una categoria que define cuanto cuesta ejecutarlo y que modelos puede usar.

| Categoria    | Creditos por ejecucion | Limite de tokens | Descripcion                                            |
| ------------ | ---------------------- | ---------------- | ------------------------------------------------------ |
| **LIGHT**    | 1 credito              | 20,000 tokens    | Tareas simples y rapidas con respuestas directas       |
| **STANDARD** | 5 creditos             | 100,000 tokens   | Workflows completos con multiples pasos y herramientas |
| **ADVANCED** | 20 creditos            | 250,000 tokens   | Agentes complejos multi-step con reasoning avanzado    |

### Ejemplo de calculo

Un cliente en plan **Starter** (750 creditos/mes) con un Workflow de categoria **STANDARD** (5 creditos):

- Puede ejecutar hasta **150 conversaciones** por mes antes de agotar su balance.
- Si activa Overage, puede continuar ejecutando hasta el limite configurado.

---

## 3. Modelos de IA y Tiers

Los modelos disponibles se agrupan en tiers. Todos los tiers estan disponibles en todas las categorias de Workflow.

| Tier         | Modelos incluidos             | Descripcion                              |
| ------------ | ----------------------------- | ---------------------------------------- |
| **BASIC**    | `gpt-4o-mini`, `claude-haiku` | Rapidos y economicos, ideales para LIGHT |
| **STANDARD** | `gpt-4o`, `claude-sonnet`     | Equilibrio entre calidad y velocidad     |
| **PREMIUM**  | `gpt-4-turbo`, `claude-opus`  | Maxima capacidad de razonamiento         |

El costo en creditos no cambia segun el modelo — solo segun la categoria del Workflow. El costo real en USD si varia por modelo, pero eso es un calculo interno que no afecta al usuario.

---

## 4. Overage (Consumo Excedente)

Cuando una organizacion agota sus creditos mensuales, puede seguir ejecutando Workflows si tiene el **Overage activado**.

### Precio del Overage

```
$1.00 MXN  /  $0.05 USD  por credito adicional
```

Venia de $0.16 USD, que era 4.8x la tarifa de plan y castigaba justo al cliente que estaba creciendo. A $0.05 sigue siendo racional subir de plan —un STARTER que duplica su consumo paga $0.039/credito por la via del overage contra $0.031 en GROWTH— sin que el sobregiro se sienta multa.

### Limite de Overage

Cada plan incluye un limite de overage por defecto igual a sus creditos mensuales:

| Plan       | Limite de Overage por defecto                          |
| ---------- | ------------------------------------------------------ |
| Free       | No disponible                                          |
| Starter    | 750 creditos (hasta $750 MXN / $37.50 USD)             |
| Growth     | 2,550 creditos (hasta $2,550 MXN / $127.50 USD)        |
| Business   | 6,900 creditos (hasta $6,900 MXN / $345.00 USD)        |
| Pro        | 18,750 creditos (hasta $18,750 MXN / $937.50 USD)      |
| Enterprise | Configurable                                           |

La organizacion puede ajustar su limite de overage desde el panel de Billing. Los creditos de overage se cobran al final del mes en la siguiente factura de Stripe.

---

## 5. Renovacion Mensual de Creditos

Los creditos se asignan automaticamente al inicio de cada ciclo de facturacion. Los creditos no utilizados **si se acumulan** al mes siguiente: la renovacion suma el balance del plan al saldo positivo existente (ver `addCredits` en `credits.service.ts`, que hace `balanceAfter = balanceBefore + amount`). Cuando hay saldo negativo por overage, la renovacion lo reconcilia primero y deja el balance en los creditos del plan.

El historial completo de asignaciones, deducciones y cargos queda registrado en la tabla `CreditTransactions` de la base de datos, con los tipos:

| Tipo de transaccion               | Cuando ocurre                          |
| --------------------------------- | -------------------------------------- |
| `SUBSCRIPTION_RENEWAL`            | Cada mes al renovar el plan            |
| `EXECUTION_DEDUCTION`             | Cada vez que un Workflow se ejecuta    |
| `OVERAGE_CHARGE`                  | Al facturar creditos negativos del mes |
| `PLAN_UPGRADE` / `PLAN_DOWNGRADE` | Al cambiar de plan                     |
| `MANUAL_ADJUSTMENT`               | Ajuste realizado por un administrador  |

---

## 6. Actualizar Valores de Planes

Son dos archivos distintos segun lo que se cambie:

**Creditos y limites** (usuarios, workflows, API keys, datasets, filas, overage):

```
packages/types/src/billing/subscriptions/plans.ts
```

Al ser un paquete compartido (`@tesseract/types`), el cambio se refleja automaticamente en el Gateway y el Web-Client sin tocar codigo adicional.

Los `monthlyCredits` **no son numeros elegidos a ojo**: se derivan del costo real medido de un credito por un multiplo objetivo que decrece con el plan. Recalibrar exige volver a medir contra `Execution.cost`, no ajustar a intuicion — el detalle del calculo esta en el comentario de `PLANS`. Y solo se puede a la baja avisando un mes antes: reducir creditos afecta la facturacion del cliente.

**Precios**: no se tocan aqui. Se editan en el catalogo de

```
scripts/stripe/sync-catalog.ts
```

y se aplican corriendo ese script contra el entorno (`--apply`). Stripe es la fuente de verdad y `GET /billing/plans` los resuelve en vivo con una cache de 5 minutos, asi que un cambio de precio no necesita redeploy. Tener el importe tambien en `plans.ts` dejaria dos cifras que pueden discrepar en silencio: la que se muestra y la que se cobra.

> Cambiar un precio o los creditos obliga a revisar tambien la landing (`products/fractal-hub`), que los tiene escritos a mano en `apps/tesseract/src/app/planes/page.tsx`, en los terminos, y en el `SYSTEM_PROMPT` del asistente Nova de **ambas** apps. No hay nada que los sincronice: en agosto de 2026 la landing estuvo cotizando los creditos previos a la recalibracion y un overage 3.2x mas caro que el real.
