-- Migration: Convert remaining TEXT columns to proper PostgreSQL enum types
-- All columns were previously TEXT storing lowercase values.
-- Each enum is created and columns are cast using UPPER() with CASE for special mappings.

-- ============================================
-- CREATE ENUM TYPES
-- ============================================
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');
CREATE TYPE "ConversationChannel" AS ENUM ('DASHBOARD', 'WHATSAPP', 'WEB', 'API');
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "ToolConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR', 'EXPIRED_AUTH');
CREATE TYPE "DangerLevel" AS ENUM ('SAFE', 'WARNING', 'DANGER');
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'API', 'SCHEDULE', 'WEBHOOK', 'WHATSAPP');
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- ============================================
-- executions.status  (pending -> PENDING, etc.)
-- ============================================
ALTER TABLE executions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE executions ALTER COLUMN status TYPE "ExecutionStatus" USING (UPPER(status)::"ExecutionStatus");

-- ============================================
-- conversations.status  (active -> ACTIVE, etc.)
-- ============================================
ALTER TABLE conversations ALTER COLUMN status DROP DEFAULT;
ALTER TABLE conversations ALTER COLUMN status TYPE "ConversationStatus" USING (UPPER(status)::"ConversationStatus");
ALTER TABLE conversations ALTER COLUMN status SET DEFAULT 'ACTIVE'::"ConversationStatus";

-- ============================================
-- conversations.channel  (dashboard -> DASHBOARD, etc.)
-- ============================================
ALTER TABLE conversations ALTER COLUMN channel TYPE "ConversationChannel" USING (UPPER(channel)::"ConversationChannel");

-- ============================================
-- messages.role  (human -> USER, assistant -> ASSISTANT, etc.)
-- ============================================
ALTER TABLE messages ALTER COLUMN role TYPE "ChatRole"
  USING (CASE role
    WHEN 'human'     THEN 'USER'
    WHEN 'assistant' THEN 'ASSISTANT'
    WHEN 'system'    THEN 'SYSTEM'
    WHEN 'tool'      THEN 'TOOL'
    ELSE UPPER(role)
  END)::"ChatRole";

-- ============================================
-- tenant_tools.status  (connected -> CONNECTED, etc.)
-- ============================================
ALTER TABLE tenant_tools ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tenant_tools ALTER COLUMN status TYPE "ToolConnectionStatus"
  USING (CASE status
    WHEN 'connected'    THEN 'CONNECTED'
    WHEN 'disconnected' THEN 'DISCONNECTED'
    WHEN 'error'        THEN 'ERROR'
    WHEN 'expired_auth' THEN 'EXPIRED_AUTH'
    ELSE 'DISCONNECTED'
  END)::"ToolConnectionStatus";
ALTER TABLE tenant_tools ALTER COLUMN status SET DEFAULT 'DISCONNECTED'::"ToolConnectionStatus";

-- ============================================
-- tool_functions.dangerLevel  (safe -> SAFE, warning -> WARNING)
-- ============================================
ALTER TABLE tool_functions ALTER COLUMN "dangerLevel" DROP DEFAULT;
ALTER TABLE tool_functions ALTER COLUMN "dangerLevel" TYPE "DangerLevel" USING (UPPER("dangerLevel")::"DangerLevel");
ALTER TABLE tool_functions ALTER COLUMN "dangerLevel" SET DEFAULT 'SAFE'::"DangerLevel";

-- ============================================
-- whatsapp_configs.connectionStatus  (disconnected -> DISCONNECTED, etc.)
-- ============================================
ALTER TABLE whatsapp_configs ALTER COLUMN "connectionStatus" DROP DEFAULT;
ALTER TABLE whatsapp_configs ALTER COLUMN "connectionStatus" TYPE "WhatsAppConnectionStatus" USING (UPPER("connectionStatus")::"WhatsAppConnectionStatus");
ALTER TABLE whatsapp_configs ALTER COLUMN "connectionStatus" SET DEFAULT 'DISCONNECTED'::"WhatsAppConnectionStatus";

-- ============================================
-- executions.trigger  (manual -> MANUAL, api -> API, etc.)
-- ============================================
ALTER TABLE executions ALTER COLUMN trigger DROP DEFAULT;
ALTER TABLE executions ALTER COLUMN trigger TYPE "TriggerType" USING (UPPER(trigger)::"TriggerType");

-- ============================================
-- conversations.lastMessageRole  ('user' -> USER, 'assistant' -> ASSISTANT, etc.)
-- ============================================
ALTER TABLE conversations ALTER COLUMN "lastMessageRole" TYPE "ChatRole"
  USING (CASE "lastMessageRole"
    WHEN 'human'     THEN 'USER'
    WHEN 'user'      THEN 'USER'
    WHEN 'assistant' THEN 'ASSISTANT'
    WHEN 'system'    THEN 'SYSTEM'
    WHEN 'tool'      THEN 'TOOL'
    ELSE UPPER("lastMessageRole")
  END)::"ChatRole";
