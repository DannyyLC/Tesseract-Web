---
title: 'Pendientes Legales'
description: 'Backlog de lo que falta para dar validez legal plena a los documentos publicos (Terminos, Privacidad y Politicas) conforme a la legislacion mexicana (LFPDPPP).'
---

Este documento registra los faltantes detectados en una auditoria de los tres documentos
legales publicos (`/terms`, `/privacy`, `/policies`). No son cambios urgentes de codigo:
son requisitos legales que el equipo esta trabajando en conseguir. Sirve como checklist
para futuras iteraciones.

> Estado verificado: los **datos** de los documentos (creditos, capacidades, categorias,
> overage $0.16 y el rollover de creditos) **si coinciden** con el backend/billing
> (`packages/types/src/billing/subscriptions/plans.ts`). Lo que falta es contenido legal,
> no correccion de cifras.

---

## 1. Transversal (aplica a los tres documentos)

- [ ] **Fecha de vigencia / version / "ultima actualizacion"** en cada documento.
      Hoy ausente; es indispensable para la validez y para poder operar la clausula de
      "30 dias de notificacion previa" ante cambios.
- [ ] **Identidad legal del Responsable**: nombre completo, domicilio y RFC.
      La empresa no esta constituida, por lo que el Responsable sera el **miembro encargado
      de facturacion** como **persona fisica** (asume la responsabilidad legal de forma
      personal). _Pendiente: capturar sus datos reales (nombre, domicilio fiscal, RFC)._

---

## 2. Privacidad — brechas frente a la LFPDPPP

- [ ] **Aviso de Privacidad completo**: actualmente faltan identidad y domicilio del
      responsable, categorias de datos personales tratados (nombre, email, datos de pago, etc.),
      finalidades primarias y secundarias, y contacto del area/depto. de datos personales
      (no basta "panel de soporte").
- [ ] **Separar rol Responsable vs Encargado**: hoy todo el dato se trata como del Cliente con
      Fractal como mero "Encargado". Para los datos de la cuenta y facturacion del titular,
      Fractal (la persona fisica) es **Responsable** y debe su propio aviso.
- [ ] **Procedimiento ARCO** (Acceso, Rectificacion, Cancelacion, Oposicion) con plazos legales,
      y **mecanismo de revocacion de consentimiento**. Hoy solo se listan los derechos.
- [ ] **Corregir referencia a "SCC" (Clausulas Contractuales Estandar)**: son figura del RGPD/UE,
      no de la LFPDPPP. La transferencia internacional de datos (almacenamiento en Google Cloud
      us-central) debe apoyarse en bases validas bajo la LFPDPPP (consentimiento, necesidad
      contractual, art. 36/37).
- [ ] **Periodos de retencion concretos** (hoy "periodo prolongado", sin plazo).
- [ ] **Politica de cookies / tracking**.
- [ ] **Obligacion de notificacion de brechas de seguridad**.
- [ ] **Referenciar un DPA / contrato de encargo** entre Fractal y el Cliente.

---

## 3. Terminos y Condiciones — clausulas ausentes

- [ ] **SLA / niveles de servicio**: la descripcion de Politicas anuncia "niveles de servicio"
      pero no existe la seccion. Definir uptime objetivo y creditos por caida.
- [ ] **Impuestos / IVA**: los precios estan en USD sin clausula de impuestos (relevante para
      facturacion en Mexico).
- [ ] **Terminos de pago**: metodo (Stripe), moneda, y consecuencias de mora.
- [ ] **Descargo de garantias ("AS IS")** e **indemnizacion** (hoy debil o inexistente).
- [ ] **Capacidad para contratar / edad minima** del Cliente.
- [ ] **Fuerza mayor** como clausula propia (hoy solo mencion de pasada).

---

## 4. Politicas — brechas

- [ ] **Seccion de SLA** faltante (ver punto 3).
- [ ] **Plazos de retencion concretos** (hoy "periodo prolongado" / "suficiente anticipacion").
