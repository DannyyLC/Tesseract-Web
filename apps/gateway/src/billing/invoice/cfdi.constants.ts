/**
 * Datos fijos con los que se emite cada CFDI.
 *
 * **Estas claves las tiene que confirmar el contador antes de facturar en producción.** No
 * son un detalle de implementación: si están mal, todas las facturas salen mal y corregirlas
 * exige cancelar ante el SAT una por una.
 */

/**
 * `ClaveProdServ` del catálogo del SAT: 81161700, "Servicios de sistemas de información".
 *
 * Es la clave habitual para un SaaS. Las alternativas plausibles son 43232000 (paquetes de
 * software) y 81112500 (servicios de datos); cuál corresponde depende de cómo esté dado de
 * alta el emisor, y eso lo decide el contador.
 */
export const CFDI_PRODUCT_KEY = '81161700';

/** `ClaveUnidad` E48: "Unidad de servicio". */
export const CFDI_UNIT_KEY = 'E48';

/** Nombre de la unidad que aparece impreso en el PDF. */
export const CFDI_UNIT_NAME = 'Servicio';

/**
 * Tasa de IVA trasladado.
 *
 * 16% es la tasa general. La frontera norte tiene un estímulo del 8%, pero requiere estar
 * inscrito en el padrón correspondiente; no aplica salvo que el contador lo indique.
 */
export const CFDI_IVA_RATE = 0.16;

/**
 * Los precios de los planes se tratan como **IVA incluido**.
 *
 * No es una preferencia contable, es una restricción: el CFDI no puede totalizar más de lo
 * que se le cobró al cliente. Stripe cobra $499 MXN y ese es el total de la factura, así que
 * el desglose sale hacia dentro — 430.17 de base más 68.83 de IVA— y no hacia fuera.
 *
 * La consecuencia comercial es real y conviene tenerla presente: el ingreso neto de un plan
 * es su precio entre 1.16, no su precio. Si algún día se decide cobrar el IVA por encima del
 * precio de lista, hay que subir los precios en Stripe y poner esta bandera en `false`.
 */
export const CFDI_PRICES_INCLUDE_TAX = true;

/**
 * `MetodoPago` PUE: pago en una sola exhibición.
 *
 * Siempre es PUE porque siempre se cobra antes de facturar. Es lo que evita el complemento
 * de pago (REP), que sería obligatorio si se emitiera la factura antes de recibir el dinero.
 */
export const CFDI_PAYMENT_METHOD = 'PUE';

/** `FormaPago` 04: tarjeta de crédito. Es como cobra Stripe Checkout. */
export const CFDI_PAYMENT_FORM_CARD = '04';

/** `FormaPago` 03: transferencia electrónica de fondos. */
export const CFDI_PAYMENT_FORM_TRANSFER = '03';

/** `TipoDeComprobante` I: ingreso. */
export const CFDI_TYPE_INCOME = 'I';

/** Moneda de los CFDI. Los clientes mexicanos siempre se cobran en pesos. */
export const CFDI_CURRENCY = 'MXN';
