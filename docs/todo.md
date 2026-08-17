---
title: 'TODO — Deuda técnica detectada'
description: 'Hallazgos pendientes de corregir: el prompt caching sin modelar en el cálculo de costos, límites de categoría no aplicados, guarda de ventana de contexto, riesgos de despliegue, secretos en el historial, campos inertes en la config de WhatsApp, reintento infinito cuando el workflow del webhook no existe, la imposibilidad deliberada de cambiar el país de facturación de una organización y el trato que debe recibir un downgrade de plan cuando lo que sobra son datos del cliente.'
---

Levantado durante la preparación del despliegue del workflow RGM (julio 2026), y ampliado con
lo que salió al migrar el pipeline de WhatsApp a Cloud Tasks (26 de julio de 2026). Nada de
esto bloquea el despliegue; se documenta para no perderlo.

---

## 1. El cálculo de costo no modela el prompt caching

**Severidad: baja — el número queda por arriba del real, nunca por debajo.**

`input_tokens` es la suma de todas las llamadas al LLM, que es lo que factura el proveedor a precio
de lista. Pero los proveedores descuentan fuerte el prefijo repetido, y ese caso es justo el más
común: las iteraciones de un loop agéntico reenvían el mismo historial. O sea que el `costUSD` que
se guarda por ejecución es un **techo**, no el número exacto.

`usage_metadata` ya trae el desglose en `input_token_details.cache_read`, pero hoy nada en el repo lo
lee y `llm_models` no tiene columna de precio de input cacheado.

**Arreglo propuesto:** separar el input fresco del cacheado en
[`usage.py`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/agents/src/core/usage.py) y
cobrar cada uno a su tarifa. Requiere una columna nueva en `llm_models` con su migración y sumarla al
CRUD de modelos del admin.

---

## 2. La restricción de tiers de modelo no restringe nada

**Severidad: baja — decidir si se define o se borra.**

`WORKFLOW_CATEGORIES` en [`plans.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/packages/types/src/billing/subscriptions/plans.ts)
declara `allowedModelTiers` por categoría, y `canUseModelInWorkflow()` no se llama desde `apps/`.
Pero implementarlo hoy **no cambiaría nada**: las tres categorías declaran
`[BASIC, STANDARD, PREMIUM]`, o sea que todo está permitido en todas.

O se definen tiers distintos por categoría —que es volver a abrir la pregunta de producto de qué
modelos puede usar un plan barato— o se borra el campo. Aplicar la función tal como está sería
código que no restringe.

**Resuelto el 17 de agosto de 2026:** la otra mitad de este punto, el techo de tokens. Se podía
crear un workflow `LIGHT` con 500k y nadie lo impedía. Ahora
[`category-token-ceiling.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/gateway/src/automation/workflows/category-token-ceiling.ts)
valida el par contra `getWorkflowMaxTokens()` en las tres puertas de entrada: `create`, `update` de
tenant y el `updateMeta` del admin.

Dos detalles del diseño que conviene no perder:

- **El par se resuelve contra lo guardado.** En una edición `category` y `maxTokensPerExecution`
  viajan por separado y ambos son opcionales; validar el DTO crudo dejaría pasar bajar la categoría
  sin tocar los tokens, que es la misma violación por la puerta de atrás.
- **Solo se valida si la edición toca alguno de los dos campos.** Una fila que ya estuviera fuera de
  rango sigue siendo editable para todo lo demás: cerrar el hueco no debería trabar lo que ya
  existe.

---

## 3. No hay guarda contra la ventana de contexto del modelo

**Severidad: media — falla en runtime contra la API del proveedor.**

`contextWindow` se guarda en `llm_models` pero **nunca se consulta en runtime**: solo aparece en
el DTO de creación y en `supersedePricing`. Hoy nada impide configurar un
`maxTokensPerExecution` mayor que la ventana del modelo más chico del workflow; el error saldría
del proveedor, en producción.

Caso concreto: `gpt-5.4-mini` (el router del RGM) tiene ventana de 400k. Un historial de 500k
no le cabe.

**Arreglo propuesto:** al resolver el workflow, tomar la ventana **más chica** entre los modelos
de todos sus agentes y usar como límite efectivo:

```
min(maxTokensPerExecution, ventanaMínima × margen)
```

Ese valor alimenta tanto el umbral de compactación como el hard cap. El margen (reservar 20–25%)
es necesario porque la ventana también aloja system prompts, definiciones de tools y la respuesta.
El que llegue primero manda.

---

## 4. `maxTokensPerExecution` está mal nombrado

**Severidad: baja — pero causa confusión real al configurar.**

El nombre sugiere un presupuesto de consumo de la ejecución. En realidad mide **el historial de
conversación que entra al payload**: todo lo que se compara contra él sale de
`estimateMessageHistoryTokens(...)`, tanto en la compactación como en el hard cap. El fan-out, el
sintetizador y las tools no suman nada ahí.

El comportamiento es correcto: se cuenta lo que se guarda y va a volver a entrar, no lo que se
gastó. Es el nombre el que engaña.

**Arreglo propuesto:** renombrar a `maxHistoryTokens` (requiere migración).

---

## 5. ¿Subir los techos de tokens por categoría?

**Severidad: baja — decisión de producto, no un defecto.**

Los techos vigentes son 20k / 100k / 250k. La propuesta era subirlos:

| Categoría | Hoy en plans.ts | Propuesto |
|---|---|---|
| `LIGHT` | 20k | **50k** |
| `STANDARD` | 100k | **200k** |
| `ADVANCED` | 250k | **300k–350k** |

`ADVANCED` se propone por debajo de 400k a propósito: es la ventana de `gpt-5.4-mini`, el modelo
más chico en uso. Mientras el punto 3 no exista, ese techo es la única protección — y desde el
punto 2 sí se aplica de verdad, así que ahora el número importa.

Subir estos límites **no cambia la facturación**: los créditos son fijos por categoría e
independientes de los tokens. Solo permite conversaciones más largas antes de compactar. Es un
cambio de una línea por categoría en `WORKFLOW_CATEGORIES`, más los comentarios del schema.

**Corregido el 17 de agosto de 2026:** los comentarios desactualizados de
`packages/database/prisma/schema.prisma`, que decían 20k/50k/128k y 25 créditos. Eran **tres**
lugares, no dos: el enum `WorkflowCategory` y también la columna `maxTokensPerExecution`. Ahora el
enum apunta a `plans.ts` como fuente de verdad para que la próxima vez se actualice un solo lado.

---

## 6. Observaciones menores

- **PII en logs.** [`apps/agents/src/tools/whatsapp_outbound.py`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/agents/src/tools/whatsapp_outbound.py)
  registra a nivel `INFO` números de teléfono destino y el contenido de las variables de plantilla
  (nombres, montos). Se dejó así a propósito para el primer despliegue; conviene bajarlo a `DEBUG`
  cuando el flujo esté estable. El log del payload completo además duplica lo que ya registra el
  log de `send_bulk_whatsapp`.
- **`"No Disponible"` hardcodeado** en español dentro del constructor de payloads del mismo
  archivo. Si algún template es multi-idioma, ese texto se cuela tal cual al cliente.
- **Cast innecesario.** `conversations.service.ts` usa
  `(NOTIFICATIONSENUM as any).CONVERSATION_NEEDS_FOLLOW_UP ?? '0000-0115'`, pero la clave sí existe
  en el enum. El cast y el fallback sobran.
- **El build de producción compila los tests.** `apps/gateway/tsconfig.json` incluye `src/**/*`, que
  arrastra todos los `.spec.ts` al build del gateway. Excluirlos reduce tiempo y memoria de
  compilación.

---

## 7. Infraestructura

**Severidad: alta — el punto de las variables puede tumbar el servicio.**

- **Las variables de entorno no están versionadas.** `infrastructure/gcp/cloudbuild.yaml` no
  pasa `--set-env-vars`, así que las ~36 variables del servicio `gateway` viven **solo en la
  consola de GCP**. Un servicio recreado desde cero las pierde todas, y no hay forma de saber
  cuál era el valor correcto. Moverlas a Secret Manager, o declararlas en el YAML.

- **Un deploy manual desde la consola ignora el YAML por completo.** Ya causó un incidente: la
  revisión `gateway-00044` traía la anotación `client-name: cloud-console`, así que ninguna de
  las banderas del YAML estaba aplicada. Todo despliegue debe ir por Cloud Build.

- **El trigger de Cloud Build está en `main`, pero se trabaja en `develop`.** Un arreglo
  commiteado en `develop` **no se despliega**. Así fue como el commit `c02fd492` (pool de
  Prisma, timeout de transacción) llevaba días escrito mientras producción corría el código
  viejo. Se confirmó porque los errores en `executions` traían el timeout antiguo de 5000 ms.
  Vale la pena decidir explícitamente si el trigger debe seguir en `main` o moverse.

- **`gcloud run deploy` conserva las banderas que no se le pasan.** Quitar una del YAML **no la
  revierte**. Por eso `--cpu-throttling` está declarado de forma explícita y no simplemente
  omitido. Tenerlo presente al modificar el paso de despliegue.

- **No existe forma de correr el seed en GCP.** El Cloud Run Job `migrate-db` ejecuta
  `prisma migrate deploy` y nada más. El seed se documenta en
  [Aplicar migraciones en GCP](/manuals/migraciones-gcp) como paso posterior, pero no hay Job que lo
  ejecute. Falta crear uno con el mismo patrón (misma imagen, misma conectividad, cambiando el
  `--args` a la tarea de seed).

---

## 8. Seguridad

**Severidad: media-alta — depende de si los secretos coinciden con producción.**

- **Secretos en el historial de git.** El commit `46aed8d1` ("Limpieza") agregó al repositorio
  `rgm_prod_import.sql` y `backup_20260725_164824.sql`, que contenían el `webhookSecret` de
  WhatsApp, un hash bcrypt de contraseña y 8 refresh tokens. Los archivos ya se sacaron del
  índice y `.gitignore` cubre `*.sql` (excepto migraciones), **pero el historial los conserva**.
  Se indicó que esos volcados eran del entorno local de Cristóbal; si aun así el `webhookSecret`
  coincide con el de producción, hay que rotarlo en YCloud y actualizar
  `Y_CLOUD_WEBHOOK_SECRET`. El token de Upstash que estaba en `.env.example` ya fue rotado.

- **Los links de media de YCloud son públicos y quedan persistidos.** Se descargan sin ninguna
  cabecera de autenticación, o sea que quien tenga la URL puede bajar el archivo. El cuerpo
  completo del webhook —incluido ese link— se guarda en `executions.triggerData` y en el buffer
  de Redis. Falta comprobar si esos links expiran:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' "<link-viejo-de-ycloud>"
  ```

  Si responde `200`, no expiran y conviene dejar de persistir el cuerpo completo. Si responde
  `403` o `404`, el riesgo es acotado.

---

## 9. Pipeline de WhatsApp — deuda menor

Levantado al migrar a Cloud Tasks. Nada urgente.

**Severidad: baja.**

- **El bitrate asumido para el límite de audio es una estimación.** El webhook no trae la
  duración, solo el link, así que `maxSeconds` se aplica convirtiéndolo a bytes con un bitrate
  supuesto de 32 kbps (`WHATSAPP_ASSUMED_AUDIO_BITRATE_KBPS`). Se eligió el extremo alto del
  rango de Opus a propósito, para errar del lado permisivo. Ahora que `sizeBytes` sí se puebla
  en `message_attachments`, en unas semanas se puede calcular el bitrate real de los audios que
  llegan y reemplazar la suposición por un número medido.

- **`image.maxBytes` y `messages.imageTooLarge` están inertes.** Existen en la política de
  media pero no se usan, porque con las imágenes apagadas nunca se descargan. Decidir si se
  quedan documentados para cuando se active el OCR o se quitan hasta entonces.

- **El OCR le pasa la URL de la imagen directamente a OpenAI.** `extractImageText` manda el
  `sourceUrl` de YCloud dentro del `image_url`, o sea que son los servidores de OpenAI los que
  tienen que descargarla. Como los links son públicos probablemente funcione, pero si expiran
  fallaría de forma intermitente. Solo importa el día que `image.enabled` se ponga en `true`;
  el arreglo sería bajar el binario y mandarlo como data URI en base64.

- **La compactación no se dispara nunca con la configuración actual.** El umbral es 80% de
  `maxTokensPerExecution`, que en el workflow del RGM son ~80 000 tokens (~320 000 caracteres
  de historial). Sus cuatro defectos ya están corregidos, pero conviene revisar el umbral
  cuando haya conversaciones reales que medir. Está relacionado con los puntos 3 y 5.

---

## 10. Campos inertes en `whatsapp_configs`

**Severidad: baja — no rompe nada, pero engaña a quien lee el esquema.**

Levantado el 31 de julio de 2026 al poner los números reales del RGM en producción.

De las 20 columnas de `whatsapp_configs`, el runtime solo lee cuatro: `phoneNumber` (el único
lookup del webhook, `getWhatsappConfigByPhoneNumber` → `findFirst` por match exacto de string),
`isActive`, `defaultWorkflowId` y `organizationId`. `connectionStatus` solo se escribe. El resto
está inerte.

**Importante: nada de esto se debe borrar todavía.** Casi todos los campos muertos son
exactamente los que hacen falta para los dos pendientes de producto —verificación con Meta y
onboarding self-service vía Facebook Login / Embedded Signup— donde el cliente conecta su propio
número sin pasarnos credenciales a mano. Conviene revisarlos cuando eso se implemente, no antes.

| Campo | Estado hoy | Por qué se queda |
|---|---|---|
| `credentialPath` | Solo existe en un DTO, nunca se lee | Destino natural del token por tenant que devuelve el Embedded Signup |
| `webhookUrl` | Se escribe al crear, nunca se lee | Meta exige callback URL por app/número al registrar el webhook |
| `provider` | Nunca se compara | Hoy todo es YCloud; si se conecta la Cloud API de Meta directo, este campo es el discriminante |
| `qrCode` / `qrCodeExpiry` / `sessionData` | Siempre `NULL` | Vienen del diseño para un proveedor tipo Baileys. Son los únicos candidatos reales a borrarse si se confirma que solo habrá proveedores por API oficial |
| `displayName` / `description` | Estaban `NULL`; ya se poblaron para el RGM | Útiles ya: sin esto no se distingue de quién es cada número al consultar la DB |

**El caso aparte es `webhookSecret`.** No es solo inerte: es engañoso. La columna existe con
`@default(uuid())` en [`schema.prisma`](https://github.com/FractalOps-Dev/Tesseract/blob/main/packages/database/prisma/schema.prisma),
o sea que el diseño original era **un secreto por config** (multi-tenant), pero la verificación
real usa `process.env.Y_CLOUD_WEBHOOK_SECRET` en
[`whatsapp-config.service.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/gateway/src/messaging/channels/whatsapp-config/whatsapp-config.service.ts):
**un único secreto global para todos los tenants**. Consecuencias:

- Si ese secreto se filtra, cualquiera puede firmar webhooks válidos haciéndose pasar por
  cualquier organización. Con un cliente en producción el riesgo es acotado; con onboarding
  self-service deja de serlo.
- El valor que hay hoy en la fila del RGM (`whsec_b167…`) trae prefijo de Stripe y ya está
  rotado — o sea que nunca fue un secreto de YCloud. Nadie lo notó porque nada lo consulta.
  Esto relativiza el punto 8: el `webhookSecret` que quedó en el historial de git no protegía
  nada.

**Arreglo propuesto (cuando se haga el multi-tenant):** que `verifySignature` resuelva el config
por `phoneNumber` y use `account.webhookSecret`, con fallback a la env var para no romper lo que
ya existe. Mientras tanto, dejar la columna documentada como no usada para que nadie asuma que
está protegiendo algo.

**Riesgo operativo a tener presente:** como `phoneNumber` es el único lookup y es match exacto de
string, el formato con el que YCloud manda el número tiene que coincidir carácter por carácter
con lo guardado (con `+`, sin espacios). Si no coincide, `account` sale `null` y el mensaje se
descarta silenciosamente con `reason: 'inactive-config'` — un 200 y nada en la conversación.
Vale la pena normalizar el número en el lookup en vez de confiar en que ambos lados coincidan.

---

## 11. El webhook de WhatsApp usa un método de UI para leer un booleano

**Severidad: baja — funciona, pero paga joins de más en la ruta caliente.**

`findOne` es un método pensado para la UI —trae `tenantTools` con joins anidados a `toolCatalog`—
y el webhook lo usa para leer un solo booleano (`isActive`) en cada mensaje entrante. Conviene un
`select` mínimo, o cachear el estado del workflow. Aplica igual al canal de Messenger, que resuelve
el workflow con el mismo método.

**Resuelto el 17 de agosto de 2026:** el bug de esta sección. La resolución del workflow lanzaba
`NotFoundException` cuando el workflow no existía, había sido borrado en suave o era de otra
organización; el throw caía en el `catch` del webhook, que libera el claim de deduplicación y
responde 500 para que YCloud reintente. Una fila de `whatsapp_configs` apuntando a un workflow
eliminado convertía cada mensaje entrante en un ciclo de reintentos. Ahora responde 200 con
`ignored: 'missing-workflow'`, igual que Messenger, y solo las fallas que no son `NotFoundException`
siguen pidiendo reintento.

**Nota sobre el commit `b66eb168`** ("Inactive Workflow - Whatsapp Channel", 29 de julio de 2026),
que introdujo las guardas: su mensaje dice "Added a guard to prevent from sending read
acknowledgments to the whatsapp server", pero no hay código de read receipts en `apps/gateway` (no
existe `markAsRead`, `read_receipt` ni equivalente) y las guardas sí responden 200, que es
precisamente un acuse a YCloud. Lo que hacen es cortar el ingreso al pipeline. Vale anotarlo porque
quien busque el cambio por el mensaje no lo va a encontrar.

**Relación con el punto 10.** Ya son **cinco** las rutas por las que un mensaje del cliente termina
en un 200 sin dejar rastro en la conversación: `unknown-config`, `inactive-config`, `no-workflow`,
`missing-workflow` e `inactive-workflow` — más `blocked-contact`, que sí es deliberado. El riesgo
operativo señalado al final del punto 10 aplica igual aquí. Si se agrega observabilidad para los
descartes, conviene cubrir todas de una vez.

---

## 12. No se puede cambiar el país (ni la moneda) de una organización

**Severidad: baja — decisión deliberada, no un olvido.**

Desde la facturación regionalizada, `organizations.country` determina la moneda de cobro. Se
escribe una sola vez, al crear la sesión de checkout, y **no hay ninguna vía en la aplicación para
cambiarlo**: no aparece en `UpdateOrganizationDto`, la página de configuración lo muestra como
texto de solo lectura y `organizations.service.update()` ni lo toca.

**Por qué está cerrado.** Stripe congela la moneda del `Customer` en su primera factura y es
irreversible. Cambiarla obliga a:

1. Cancelar la suscripción y crear un `Customer` nuevo — las suscripciones no se pueden mover
   entre clientes.
2. Volver a contratar, lo que reinicia el ciclo de facturación y cobra de inmediato.
3. Dejar al cliente sin acceso desde el portal a sus facturas anteriores, que quedan colgando del
   cliente viejo (siguen existiendo en el panel de Stripe, pero él ya no las ve).

Y lo que de verdad pesa: **con saldo negativo se pierde dinero**. La deuda de overage quedó
fotografiada en `credit_balances.invoicedOverageCredits` para cobrarse en la siguiente factura del
cliente viejo, factura que ya nunca llega porque se canceló su suscripción. La deuda se evapora
sin que nada lo señale.

**Por qué no se automatizó.** Una organización no cambia de país; a la fecha el caso tiene cero
ocurrencias. Construir el flujo —cancelar, recrear, reconciliar deuda y manejar los fallos a mitad
de camino— cuesta bastante más que atender a mano los casos que haya.

**Arreglo manual, mientras el volumen sea el de hoy:** liquidar el saldo (que `balance >= 0`),
cancelar la suscripción en el panel de Stripe, poner `organizations.country` y
`organizations.stripeCustomerId` en NULL por SQL, y pedirle al cliente que vuelva a contratar. El
checkout creará un `Customer` nuevo con la moneda correcta.

**Si algún día se automatiza**, lo mínimo sería: exigir saldo no negativo, cobrar el overage
pendiente en la factura final del cliente viejo antes de cancelar, y avisar en la UI de la pérdida
de acceso a las facturas anteriores.

---

## 13. El downgrade de plan no puede tratar los datos del cliente como a los workflows

**Severidad: media — a definir antes de implementar Datasets.**

Cuando una organización baja de plan, `enforceLimits()` en
[`apps/gateway/src/billing/subscriptions/billing.service.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/gateway/src/billing/subscriptions/billing.service.ts)
recorta lo que sobra: **desactiva** workflows, API keys y usuarios por encima del nuevo límite. Es
correcto para esos tres, porque desactivar es reversible y no destruye nada.

Ese patrón **no se puede extender a los Datasets** (las mini bases de datos que el cliente captura
para que su agente las consulte). Ahí lo que sobra son filas suyas: si Growth permite 5 000 y baja a
Starter con 1 000, "recortar" significa borrar 4 000 registros que él cargó a mano o importó por CSV.
Eso es pérdida de datos del cliente provocada por un cambio de plan, y no hay forma de deshacerlo.

**Propuesta a discutir con el equipo:** al bajar de plan, en lugar de recortar, **bloquear la
escritura** — no se pueden crear filas nuevas ni importar CSV hasta que el conteo vuelva a estar bajo
el límite— pero **no borrar nada y dejar la lectura intacta**. Así:

- El cliente conserva sus datos y decide él qué depurar.
- El agente sigue funcionando: la tool de búsqueda sigue viendo el dataset completo, así que una baja
  de plan no rompe conversaciones en producción.
- El incentivo comercial se mantiene: para volver a cargar datos hay que subir de plan o depurar.

Queda por acordar: si el bloqueo aplica también a **editar** filas existentes (yo lo dejaría pasar,
editar no aumenta el conteo), si conviene un periodo de gracia antes de bloquear, y cómo se le avisa
en la UI —porque un botón de "agregar fila" deshabilitado sin explicación es peor que el límite.
