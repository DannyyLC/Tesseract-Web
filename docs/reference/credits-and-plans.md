---
title: 'Creditos y Planes'
description: 'Referencia completa de planes, creditos, limites y costos de overage del sistema de facturacion.'
---

El sistema de creditos es el motor economico de Tesseract. Cada ejecucion de un Workflow consume creditos del balance mensual de la organizacion.

La fuente de verdad de estos valores esta en `packages/types/src/billing/subscriptions/plans.ts`.

---

## 1. Tabla de Planes

| Plan           | Precio/mes    | Creditos/mes  | Usuarios  | Workflows | API Keys  |
| -------------- | ------------- | ------------- | --------- | --------- | --------- |
| **Free**       | $0 USD        | 0             | 1         | 3         | 3         |
| **Starter**    | $25 USD       | 200           | 10        | 10        | 50        |
| **Growth**     | $79 USD       | 650           | 25        | 25        | 100       |
| **Business**   | $199 USD      | 1,800         | 50        | 100       | 250       |
| **Pro**        | $499 USD      | 5,000         | 100       | 250       | 500       |
| **Enterprise** | Personalizado | Personalizado | Ilimitado | Ilimitado | Ilimitado |

> El plan **Free** no incluye creditos mensuales. Solo permite usar el dashboard y crear hasta 3 Workflows sin ejecutarlos con IA.

---

## 2. Categorias de Workflow y Costo en Creditos

Cada Workflow tiene una categoria que define cuanto cuesta ejecutarlo y que modelos puede usar.

| Categoria    | Creditos por ejecucion | Limite de tokens | Descripcion                                            |
| ------------ | ---------------------- | ---------------- | ------------------------------------------------------ |
| **LIGHT**    | 1 credito              | 20,000 tokens    | Tareas simples y rapidas con respuestas directas       |
| **STANDARD** | 5 creditos             | 100,000 tokens   | Workflows completos con multiples pasos y herramientas |
| **ADVANCED** | 20 creditos            | 250,000 tokens   | Agentes complejos multi-step con reasoning avanzado    |

### Ejemplo de calculo

Un cliente en plan **Starter** (200 creditos/mes) con un Workflow de categoria **STANDARD** (5 creditos):

- Puede ejecutar hasta **40 conversaciones** por mes antes de agotar su balance.
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
$0.16 USD por credito adicional
```

### Limite de Overage

Cada plan incluye un limite de overage por defecto igual a sus creditos mensuales:

| Plan       | Limite de Overage por defecto                  |
| ---------- | ---------------------------------------------- |
| Free       | No disponible                                  |
| Starter    | 200 creditos (hasta $32.00 USD adicionales)    |
| Growth     | 650 creditos (hasta $104.00 USD adicionales)   |
| Business   | 1,800 creditos (hasta $288.00 USD adicionales) |
| Pro        | 5,000 creditos (hasta $800.00 USD adicionales) |
| Enterprise | Configurable                                   |

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

Si en el futuro se necesita cambiar el precio, los creditos u otros limites de algun plan, el unico archivo a modificar es:

```
packages/types/src/billing/subscriptions/plans.ts
```

Al ser un paquete compartido (`@tesseract/types`), el cambio se refleja automaticamente en el Gateway y el Web-Client sin tocar codigo adicional.
