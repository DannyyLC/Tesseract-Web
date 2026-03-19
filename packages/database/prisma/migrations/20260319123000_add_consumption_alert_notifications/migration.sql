-- Update low credits template and add additional credit alert notifications.
UPDATE "notifications"
SET
  "titleTemplate" = 'Aviso De Créditos Bajos.',
  "messageTemplate" = 'Tu organización tiene pocos créditos disponibles. Te quedan %s créditos.',
  "targetRoles" = '["OWNER","ADMIN"]'::jsonb,
  "isActive" = true
WHERE "code" = '0000-0110' AND "version" = 1;

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
    'notif-0000-0112-v1',
    '0000-0112',
    1,
    'Sin Créditos Disponibles.',
    'Tu organización se ha quedado sin créditos disponibles. Adquiere créditos o actualiza tu plan para continuar ejecutando workflows.',
    '["OWNER","ADMIN"]'::jsonb,
    true
  ),
  (
    'notif-0000-0113-v1',
    '0000-0113',
    1,
    'Límite De Overage Alcanzado.',
    'No se puede ejecutar el workflow porque se alcanzó el límite de overage (%s/%s).',
    '["OWNER","ADMIN"]'::jsonb,
    true
  )
ON CONFLICT ("code", "version") DO UPDATE
SET
  "titleTemplate" = EXCLUDED."titleTemplate",
  "messageTemplate" = EXCLUDED."messageTemplate",
  "targetRoles" = EXCLUDED."targetRoles",
  "isActive" = EXCLUDED."isActive";
