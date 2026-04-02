-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "WorkflowCategory" AS ENUM ('LIGHT', 'STANDARD', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SUBSCRIPTION_RENEWAL', 'PLAN_UPGRADE', 'PLAN_DOWNGRADE', 'EXECUTION_DEDUCTION', 'OVERAGE_CHARGE', 'MANUAL_ADJUSTMENT', 'REFUND', 'ONE_TIME_PURCHASE');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SUBSCRIPTION', 'OVERAGE', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "MessageAttachmentType" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "MessageAttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'ADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CompactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('DASHBOARD', 'WHATSAPP', 'WEB', 'API');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "MessageFeedback" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'API', 'SCHEDULE', 'WEBHOOK', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ToolConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR', 'EXPIRED_AUTH');

-- CreateEnum
CREATE TYPE "DangerLevel" AS ENUM ('SAFE', 'WARNING', 'DANGER');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "defaultMaxMessages" INTEGER,
    "defaultInactivityHours" INTEGER,
    "defaultMaxCostPerConv" DECIMAL(19,4),
    "allowOverages" BOOLEAN NOT NULL DEFAULT false,
    "overageLimit" INTEGER,
    "customMaxUsers" INTEGER,
    "customMaxApiKeys" INTEGER,
    "customMaxWorkflows" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "deactivationReason" TEXT,
    "shardKey" TEXT,
    "region" TEXT DEFAULT 'us-central',
    "metadata" JSONB,
    "stripeCustomerId" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pendingPlanChange" "SubscriptionPlan",
    "planChangeRequestedAt" TIMESTAMP(3),
    "planChangeRequestedBy" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "customMonthlyPrice" DECIMAL(19,4),
    "customMonthlyCredits" INTEGER,
    "customMaxWorkflows" INTEGER,
    "customOverageLimit" INTEGER,
    "customFeatures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
    "currentMonthSpent" INTEGER NOT NULL DEFAULT 0,
    "currentMonthCostUSD" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "invoicedOverageCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "subscriptionId" TEXT,
    "executionId" TEXT,
    "invoiceId" TEXT,
    "workflowCategory" "WorkflowCategory",
    "costUSD" DECIMAL(19,8),
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "subscriptionId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "subtotal" DECIMAL(19,4) NOT NULL,
    "overageCredits" INTEGER NOT NULL DEFAULT 0,
    "overageAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeHostedUrl" TEXT,
    "stripePdfUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "googleId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationTokenExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "avatar" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "end_users" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "externalId" TEXT,
    "sessionId" TEXT,
    "name" TEXT,
    "avatar" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "end_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "endUserId" TEXT,
    "workflowId" TEXT NOT NULL,
    "whatsappConfigId" TEXT,
    "phoneNumberSender" TEXT,
    "title" TEXT,
    "channel" "ConversationChannel" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(19,8) NOT NULL DEFAULT 0,
    "isHumanInTheLoop" BOOLEAN NOT NULL DEFAULT false,
    "isCompacting" BOOLEAN NOT NULL DEFAULT false,
    "compactingLockedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageRole" "ChatRole",
    "autoCloseAt" TIMESTAMP(3),
    "currentCompactionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_user_xor_enduser" CHECK (("userId" IS NULL) <> ("endUserId" IS NULL))
);

-- CreateTable
CREATE TABLE "conversation_compactions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" TEXT,
    "sourceMessageFromId" TEXT,
    "sourceMessageToId" TEXT,
    "tokensBefore" INTEGER NOT NULL,
    "tokensAfter" INTEGER NOT NULL,
    "compressionRatio" DOUBLE PRECISION NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "status" "CompactionStatus" NOT NULL,
    "error" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_compactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "model" TEXT,
    "tokens" INTEGER,
    "cost" DECIMAL(19,8),
    "latencyMs" INTEGER,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" "MessageFeedback",
    "feedbackComment" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "MessageAttachmentType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "contentHash" TEXT,
    "processingStatus" "MessageAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "processedText" TEXT,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "processor" TEXT,
    "processorVersion" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_models" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "tier" "ModelTier" NOT NULL,
    "category" TEXT,
    "inputPricePer1m" DECIMAL(19,6) NOT NULL,
    "outputPricePer1m" DECIMAL(19,6) NOT NULL,
    "contextWindow" INTEGER NOT NULL,
    "recommendedMaxTokens" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_catalog" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isInBeta" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "category" TEXT,
    "authConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_functions" (
    "id" TEXT NOT NULL,
    "toolCatalogId" TEXT NOT NULL,
    "functionName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT DEFAULT 'general',
    "oauthScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isInBeta" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "dangerLevel" "DangerLevel" DEFAULT 'SAFE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_tools" (
    "id" TEXT NOT NULL,
    "toolCatalogId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB,
    "allowedFunctions" JSONB,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "status" "ToolConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectionError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "tenant_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_tool_credentials" (
    "id" TEXT NOT NULL,
    "tenantToolId" TEXT NOT NULL,
    "oauthProvider" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_tool_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "category" "WorkflowCategory" NOT NULL,
    "maxTokensPerExecution" INTEGER NOT NULL,
    "maxMessages" INTEGER,
    "inactivityHours" INTEGER,
    "maxCostPerConversation" DECIMAL(19,4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "triggerType" "TriggerType"[] DEFAULT ARRAY[]::"TriggerType"[],
    "timeout" INTEGER NOT NULL DEFAULT 300,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "totalCreditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "avgCreditsPerExecution" DOUBLE PRECISION,
    "lastExecutedAt" TIMESTAMP(3),
    "avgExecutionTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "errorStack" TEXT,
    "trigger" "TriggerType" NOT NULL DEFAULT 'MANUAL',
    "triggerData" JSONB,
    "logs" TEXT,
    "stepResults" JSONB,
    "cost" DECIMAL(19,8) NOT NULL DEFAULT 0,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER,
    "balanceBefore" INTEGER,
    "balanceAfter" INTEGER,
    "wasOverage" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userId" TEXT,
    "apiKeyId" TEXT,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "credentialPath" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "connectionStatus" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastConnectedAt" TIMESTAMP(3),
    "connectionError" TEXT,
    "qrCode" TEXT,
    "qrCodeExpiry" TIMESTAMP(3),
    "sessionData" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultWorkflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "statusCode" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "duration" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFromInvitation" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "titleTemplate" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "targetRoles" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "titleSnapshot" TEXT NOT NULL,
    "messageSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkflowToTenantTool" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TagToWorkflow" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "organizations_deletedAt_idx" ON "organizations"("deletedAt");

-- CreateIndex
CREATE INDEX "organizations_isActive_idx" ON "organizations"("isActive");

-- CreateIndex
CREATE INDEX "organizations_deactivatedAt_idx" ON "organizations"("deactivatedAt");

-- CreateIndex
CREATE INDEX "organizations_plan_idx" ON "organizations"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "subscriptions_pendingPlanChange_idx" ON "subscriptions"("pendingPlanChange");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "credit_balances_organizationId_key" ON "credit_balances"("organizationId");

-- CreateIndex
CREATE INDEX "credit_balances_balance_idx" ON "credit_balances"("balance");

-- CreateIndex
CREATE INDEX "credit_balances_updatedAt_idx" ON "credit_balances"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_executionId_key" ON "credit_transactions"("executionId");

-- CreateIndex
CREATE INDEX "credit_transactions_organizationId_createdAt_idx" ON "credit_transactions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_type_createdAt_idx" ON "credit_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_subscriptionId_idx" ON "credit_transactions"("subscriptionId");

-- CreateIndex
CREATE INDEX "credit_transactions_invoiceId_idx" ON "credit_transactions"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_createdAt_idx" ON "invoices"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_type_status_idx" ON "invoices"("type", "status");

-- CreateIndex
CREATE INDEX "invoices_status_dueAt_idx" ON "invoices"("status", "dueAt");

-- CreateIndex
CREATE INDEX "invoices_subscriptionId_idx" ON "invoices"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "end_users_organizationId_idx" ON "end_users"("organizationId");

-- CreateIndex
CREATE INDEX "end_users_phoneNumber_idx" ON "end_users"("phoneNumber");

-- CreateIndex
CREATE INDEX "end_users_email_idx" ON "end_users"("email");

-- CreateIndex
CREATE INDEX "end_users_sessionId_idx" ON "end_users"("sessionId");

-- CreateIndex
CREATE INDEX "end_users_lastSeenAt_idx" ON "end_users"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "end_users_organizationId_phoneNumber_key" ON "end_users"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "end_users_organizationId_email_key" ON "end_users"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "end_users_organizationId_externalId_key" ON "end_users"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_currentCompactionId_key" ON "conversations"("currentCompactionId");

-- CreateIndex
CREATE INDEX "conversations_organizationId_idx" ON "conversations"("organizationId");

-- CreateIndex
CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");

-- CreateIndex
CREATE INDEX "conversations_endUserId_idx" ON "conversations"("endUserId");

-- CreateIndex
CREATE INDEX "conversations_workflowId_idx" ON "conversations"("workflowId");

-- CreateIndex
CREATE INDEX "conversations_whatsappConfigId_idx" ON "conversations"("whatsappConfigId");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_channel_idx" ON "conversations"("channel");

-- CreateIndex
CREATE INDEX "conversations_createdAt_idx" ON "conversations"("createdAt");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_autoCloseAt_idx" ON "conversations"("autoCloseAt");

-- CreateIndex
CREATE INDEX "conversations_closedAt_idx" ON "conversations"("closedAt");

-- CreateIndex
CREATE INDEX "conversations_deletedAt_idx" ON "conversations"("deletedAt");

-- CreateIndex
CREATE INDEX "conversations_compactingLockedAt_idx" ON "conversations"("compactingLockedAt");

-- CreateIndex
CREATE INDEX "conversations_workflowId_status_lastMessageAt_idx" ON "conversations"("workflowId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_channel_whatsappConfigId_phoneNumberSender_st_idx" ON "conversations"("channel", "whatsappConfigId", "phoneNumberSender", "status", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_compactions_conversationId_createdAt_idx" ON "conversation_compactions"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_compactions_status_createdAt_idx" ON "conversation_compactions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_compactions_deletedAt_idx" ON "conversation_compactions"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_compactions_conversationId_version_key" ON "conversation_compactions"("conversationId", "version");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_organizationId_createdAt_idx" ON "messages"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "message_attachments_messageId_createdAt_idx" ON "message_attachments"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "message_attachments_organizationId_contentHash_idx" ON "message_attachments"("organizationId", "contentHash");

-- CreateIndex
CREATE INDEX "message_attachments_processingStatus_idx" ON "message_attachments"("processingStatus");

-- CreateIndex
CREATE INDEX "message_attachments_createdAt_idx" ON "message_attachments"("createdAt");

-- CreateIndex
CREATE INDEX "llm_models_provider_modelName_isActive_idx" ON "llm_models"("provider", "modelName", "isActive");

-- CreateIndex
CREATE INDEX "llm_models_isActive_effectiveFrom_idx" ON "llm_models"("isActive", "effectiveFrom");

-- CreateIndex
CREATE INDEX "llm_models_tier_isActive_idx" ON "llm_models"("tier", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "llm_models_provider_modelName_effectiveFrom_key" ON "llm_models"("provider", "modelName", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "tool_catalog_toolName_key" ON "tool_catalog"("toolName");

-- CreateIndex
CREATE INDEX "tool_catalog_isActive_idx" ON "tool_catalog"("isActive");

-- CreateIndex
CREATE INDEX "tool_catalog_category_idx" ON "tool_catalog"("category");

-- CreateIndex
CREATE INDEX "tool_functions_toolCatalogId_isActive_idx" ON "tool_functions"("toolCatalogId", "isActive");

-- CreateIndex
CREATE INDEX "tool_functions_toolCatalogId_category_idx" ON "tool_functions"("toolCatalogId", "category");

-- CreateIndex
CREATE INDEX "tool_functions_isActive_idx" ON "tool_functions"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tool_functions_toolCatalogId_functionName_key" ON "tool_functions"("toolCatalogId", "functionName");

-- CreateIndex
CREATE INDEX "tenant_tools_organizationId_displayName_idx" ON "tenant_tools"("organizationId", "displayName");

-- CreateIndex (partial unique: solo tools activas, permite reusar nombre de eliminadas)
CREATE UNIQUE INDEX "tenant_tools_organizationId_displayName_active_key" ON "tenant_tools"("organizationId", "displayName") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "tenant_tools_organizationId_idx" ON "tenant_tools"("organizationId");

-- CreateIndex
CREATE INDEX "tenant_tools_toolCatalogId_idx" ON "tenant_tools"("toolCatalogId");

-- CreateIndex
CREATE INDEX "tenant_tools_isConnected_idx" ON "tenant_tools"("isConnected");

-- CreateIndex
CREATE INDEX "tenant_tools_deletedAt_idx" ON "tenant_tools"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_tool_credentials_tenantToolId_key" ON "tenant_tool_credentials"("tenantToolId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_workflowId_idx" ON "api_keys"("workflowId");

-- CreateIndex
CREATE INDEX "api_keys_deletedAt_idx" ON "api_keys"("deletedAt");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "workflows_organizationId_idx" ON "workflows"("organizationId");

-- CreateIndex
CREATE INDEX "workflows_isActive_idx" ON "workflows"("isActive");

-- CreateIndex
CREATE INDEX "workflows_deletedAt_idx" ON "workflows"("deletedAt");

-- CreateIndex
CREATE INDEX "workflows_lastExecutedAt_idx" ON "workflows"("lastExecutedAt");

-- CreateIndex
CREATE INDEX "workflows_triggerType_idx" ON "workflows"("triggerType");

-- CreateIndex
CREATE INDEX "workflows_category_idx" ON "workflows"("category");

-- CreateIndex
CREATE INDEX "executions_workflowId_idx" ON "executions"("workflowId");

-- CreateIndex
CREATE INDEX "executions_organizationId_idx" ON "executions"("organizationId");

-- CreateIndex
CREATE INDEX "executions_conversationId_idx" ON "executions"("conversationId");

-- CreateIndex
CREATE INDEX "executions_apiKeyId_idx" ON "executions"("apiKeyId");

-- CreateIndex
CREATE INDEX "executions_userId_idx" ON "executions"("userId");

-- CreateIndex
CREATE INDEX "executions_status_idx" ON "executions"("status");

-- CreateIndex
CREATE INDEX "executions_startedAt_idx" ON "executions"("startedAt");

-- CreateIndex
CREATE INDEX "executions_trigger_idx" ON "executions"("trigger");

-- CreateIndex
CREATE INDEX "executions_wasOverage_idx" ON "executions"("wasOverage");

-- CreateIndex
CREATE INDEX "executions_organizationId_trigger_startedAt_idx" ON "executions"("organizationId", "trigger", "startedAt");

-- CreateIndex
CREATE INDEX "executions_organizationId_wasOverage_idx" ON "executions"("organizationId", "wasOverage");

-- CreateIndex
CREATE INDEX "executions_organizationId_userId_startedAt_idx" ON "executions"("organizationId", "userId", "startedAt");

-- CreateIndex
CREATE INDEX "executions_organizationId_apiKeyId_startedAt_idx" ON "executions"("organizationId", "apiKeyId", "startedAt");

-- CreateIndex
CREATE INDEX "executions_deletedAt_idx" ON "executions"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_phoneNumber_key" ON "whatsapp_configs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_configs_phoneNumber_idx" ON "whatsapp_configs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_configs_connectionStatus_idx" ON "whatsapp_configs"("connectionStatus");

-- CreateIndex
CREATE INDEX "whatsapp_configs_organizationId_idx" ON "whatsapp_configs"("organizationId");

-- CreateIndex
CREATE INDEX "whatsapp_configs_deletedAt_idx" ON "whatsapp_configs"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userEmail_idx" ON "audit_logs"("userEmail");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_success_idx" ON "audit_logs"("success");

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_email_key" ON "user_verifications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_verificationCode_key" ON "user_verifications"("verificationCode");

-- CreateIndex
CREATE INDEX "user_verifications_email_idx" ON "user_verifications"("email");

-- CreateIndex
CREATE INDEX "user_verifications_expiresAt_idx" ON "user_verifications"("expiresAt");

-- CreateIndex
CREATE INDEX "notifications_code_isActive_idx" ON "notifications"("code", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_code_version_key" ON "notifications"("code", "version");

-- CreateIndex
CREATE INDEX "user_notifications_userId_organizationId_idx" ON "user_notifications"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "_WorkflowToTenantTool_AB_unique" ON "_WorkflowToTenantTool"("A", "B");

-- CreateIndex
CREATE INDEX "_WorkflowToTenantTool_B_index" ON "_WorkflowToTenantTool"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TagToWorkflow_AB_unique" ON "_TagToWorkflow"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToWorkflow_B_index" ON "_TagToWorkflow"("B");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "end_users" ADD CONSTRAINT "end_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_endUserId_fkey" FOREIGN KEY ("endUserId") REFERENCES "end_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_currentCompactionId_fkey" FOREIGN KEY ("currentCompactionId") REFERENCES "conversation_compactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_compactions" ADD CONSTRAINT "conversation_compactions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_functions" ADD CONSTRAINT "tool_functions_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "tool_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "tool_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tool_credentials" ADD CONSTRAINT "tenant_tool_credentials_tenantToolId_fkey" FOREIGN KEY ("tenantToolId") REFERENCES "tenant_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_defaultWorkflowId_fkey" FOREIGN KEY ("defaultWorkflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkflowToTenantTool" ADD CONSTRAINT "_WorkflowToTenantTool_A_fkey" FOREIGN KEY ("A") REFERENCES "tenant_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkflowToTenantTool" ADD CONSTRAINT "_WorkflowToTenantTool_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWorkflow" ADD CONSTRAINT "_TagToWorkflow_A_fkey" FOREIGN KEY ("A") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWorkflow" ADD CONSTRAINT "_TagToWorkflow_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
