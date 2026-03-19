-- Expand notifications catalog to keep template content in DB.
ALTER TABLE "notifications"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "titleTemplate" TEXT,
ADD COLUMN "messageTemplate" TEXT,
ADD COLUMN "targetRoles" JSONB,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "notifications"
SET
  "titleTemplate" = CASE "code"
    WHEN '0000-0001' THEN 'Subscripción'
    WHEN '0000-0010' THEN 'Invitación De Email.'
    WHEN '0000-0011' THEN 'Cancelación De Invitación.'
    WHEN '0000-0100' THEN 'Cancelación De Subscripción.'
    WHEN '0000-0101' THEN 'Cambio De Subscripción.'
    WHEN '0000-0110' THEN 'Aviso De Consumo.'
    WHEN '0000-0111' THEN 'Reenvio De Invitación.'
    WHEN '0000-1000' THEN 'Aceptación De Invitación.'
    ELSE 'Notificación'
  END,
  "messageTemplate" = CASE "code"
    WHEN '0000-0001' THEN 'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicación ya que formas parte fundamental de ella. Gracias por tu confianza.'
    WHEN '0000-0010' THEN 'La invitación para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitación, te lo haremos saber a traves de una notificación.'
    WHEN '0000-0011' THEN 'La invitación para %s ha sido reenviada exitosamente, por favor revisa tu correo electrónico.'
    WHEN '0000-0100' THEN 'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free.'
    WHEN '0000-0101' THEN 'La subscripcion %s ha sido cambiada (aún asi los beneficios de esta no seran cancelados hasta el inicio de la siguiente subscripción). Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s a partir de %s al %s.'
    WHEN '0000-0110' THEN 'Lamentamos informarte que los creditos disponibles para tu actual subscripcion %s estan por sobrepasar el limite. Para nosostros es de vital importancia ofrecerte un servicio continuo sin interrupciones, por lo cual tu servicio continuara funcionando sin problema alguno bajo el concepto pay as you go, es decir que se cargara el costo extra solamente de los creditos que exedan el limite del plan en tu proximo pago. El costo que se cargara por cada credito extra es de $0.01 USD, por lo cual si excedes el limite en 100 creditos, se te cobrara $%s extra en tu proximo pago.'
    WHEN '0000-0111' THEN 'La invitación para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificación.'
    WHEN '0000-1000' THEN 'La invitación para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organización. Puedes gestionar su información desde el panel de administración.'
    ELSE 'Tienes una nueva notificación.'
  END,
  "targetRoles" = '["OWNER","ADMIN"]'::jsonb
WHERE
  "titleTemplate" IS NULL
  OR "messageTemplate" IS NULL
  OR "targetRoles" IS NULL;

ALTER TABLE "notifications"
ALTER COLUMN "titleTemplate" SET NOT NULL,
ALTER COLUMN "messageTemplate" SET NOT NULL,
ALTER COLUMN "targetRoles" SET NOT NULL;

DROP INDEX IF EXISTS "notifications_code_key";
CREATE UNIQUE INDEX "notifications_code_version_key" ON "notifications"("code", "version");
CREATE INDEX "notifications_code_isActive_idx" ON "notifications"("code", "isActive");

INSERT INTO "notifications" (
  "id",
  "code",
  "version",
  "titleTemplate",
  "messageTemplate",
  "targetRoles",
  "isActive"
)
VALUES
  (
    'notif-0000-0001-v1',
    '0000-0001',
    1,
    'Subscripción',
    'Felicidades, de ahora en adelante cuentas con la subscripcion %s, la cual comienza hoy %s. El proximo pago se realizara automaticamente el %s en caso de que desee continuar con los beneficios del paquete. Estamos muy contentos de tenerte en nuestra aplicación ya que formas parte fundamental de ella. Gracias por tu confianza.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0010-v1',
    '0000-0010',
    1,
    'Invitación De Email.',
    'La invitación para %s fue exitosamente enviada, tan pronto como el email invitado acepte la invitación, te lo haremos saber a traves de una notificación.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0011-v1',
    '0000-0011',
    1,
    'Cancelación De Invitación.',
    'La invitación para %s ha sido reenviada exitosamente, por favor revisa tu correo electrónico.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0100-v1',
    '0000-0100',
    1,
    'Cancelación De Subscripción.',
    'La subscripcion %s ha sido cancelada. Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan free.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0101-v1',
    '0000-0101',
    1,
    'Cambio De Subscripción.',
    'La subscripcion %s ha sido cambiada (aún asi los beneficios de esta no seran cancelados hasta el inicio de la siguiente subscripción). Muchas gracias por la preferencia, sigue disfrutando nuestros servicios en el plan %s a partir de %s al %s.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0110-v1',
    '0000-0110',
    1,
    'Aviso De Consumo.',
    'Lamentamos informarte que los creditos disponibles para tu actual subscripcion %s estan por sobrepasar el limite. Para nosostros es de vital importancia ofrecerte un servicio continuo sin interrupciones, por lo cual tu servicio continuara funcionando sin problema alguno bajo el concepto pay as you go, es decir que se cargara el costo extra solamente de los creditos que exedan el limite del plan en tu proximo pago. El costo que se cargara por cada credito extra es de $0.01 USD, por lo cual si excedes el limite en 100 creditos, se te cobrara $%s extra en tu proximo pago.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0111-v1',
    '0000-0111',
    1,
    'Reenvio De Invitación.',
    'La invitación para %s ha sido exitosamente reenviada, una vez que sea aceptada recibiras una notificación.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-1000-v1',
    '0000-1000',
    1,
    'Aceptación De Invitación.',
    'La invitación para %s ha sido exitosamente procesada y aceptada por lo que ahora es parte de tu organización. Puedes gestionar su información desde el panel de administración.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  )
ON CONFLICT ("code", "version") DO UPDATE
SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";
