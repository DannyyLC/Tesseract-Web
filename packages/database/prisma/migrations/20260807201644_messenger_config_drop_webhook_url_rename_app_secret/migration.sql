/*
  MessengerConfig: se va `webhookUrl`, y `webhookSecret` se reemplaza por `appSecret`.

  - `webhookUrl` era puramente informativo. La URL del webhook no se enruta desde la
    base: la fija Meta en el panel de la app y la sirve el controlador. Guardar una
    copia solo daba una segunda fuente de la verdad que nadie actualizaba.

  - `webhookSecret` se heredó de la forma de WhatsAppConfig y nunca se usó en este
    canal: llevaba un uuid aleatorio por fila (`@default(uuid())`) que no significaba
    nada. `appSecret` guarda otra cosa — el App Secret de Meta, con el que se firma
    `x-hub-signature-256`.

  Por eso NO se hace `RENAME COLUMN`: conservar los uuids dejaría cada fila con un
  valor que parece un secreto válido sin serlo. En cuanto alguien lea esta columna con
  la regla habitual de "usa el de la fila, si no el del entorno", esos tenants
  quedarían verificando firmas contra basura y sus webhooks fallarían con 401. Empezar
  en NULL hace que el fallback al entorno funcione como se espera.
*/
-- AlterTable
ALTER TABLE "messenger_configs" DROP COLUMN "webhookSecret",
DROP COLUMN "webhookUrl",
ADD COLUMN     "appSecret" TEXT;
