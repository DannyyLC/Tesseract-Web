-- Zona horaria a nivel organización: fuente de verdad para las gráficas y para la
-- hora local que se le inyecta al agente. Un workflow puede sobrescribirla.
ALTER TABLE "organizations" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- Workflow.timezone pasa a significar "null = hereda de la organización".
-- El default 'UTC' anterior impedía distinguir "no configurado" de "quiero UTC".
ALTER TABLE "workflows" ALTER COLUMN "timezone" DROP DEFAULT;

-- Backfill: el dashboard nunca expuso este campo, pero la API sí lo acepta y se ha
-- usado a mano (en local hay un workflow en 'America/Monterrey'), así que 'UTC' podría
-- ser una elección deliberada y no solo el default. Revisar antes de aplicar en prod:
--   SELECT timezone, COUNT(*) FROM workflows GROUP BY 1;
-- Aun en el peor caso el cambio es una mejora: hasta ahora el gateway mandaba 'UTC' al
-- agente para todos los workflows, así que ninguno tenía la hora local correcta.
UPDATE "workflows" SET "timezone" = NULL WHERE "timezone" = 'UTC';

-- User.timezone se elimina: sin uso en el front y sin rol posible ahora que la zona
-- sale de la organización. DROP COLUMN no se deshace sin backup; revisar antes en prod:
--   SELECT timezone, COUNT(*) FROM users GROUP BY 1;
ALTER TABLE "users" DROP COLUMN "timezone";
