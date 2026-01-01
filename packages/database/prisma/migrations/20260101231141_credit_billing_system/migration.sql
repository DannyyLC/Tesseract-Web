-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'GROWTH', 'BUSINESS', 'PRO', 'ENTERPRISE');

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

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "defaultMaxMessages" INTEGER,
    "defaultInactivityHours" INTEGER,
    "defaultMaxCostPerConv" DOUBLE PRECISION,
    "allowOverages" BOOLEAN NOT NULL DEFAULT false,
    "overageLimit" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
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
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "customMonthlyPrice" DOUBLE PRECISION,
    "customMonthlyCredits" DOUBLE PRECISION,
    "customMaxWorkflows" INTEGER,
    "customOverageLimit" DOUBLE PRECISION,
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
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentMonthSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentMonthCostUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "subscriptionId" TEXT,
    "executionId" TEXT,
    "invoiceId" TEXT,
    "workflowCategory" "WorkflowCategory",
    "costUSD" DOUBLE PRECISION,
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
    "subtotal" DOUBLE PRECISION NOT NULL,
    "overageCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overageAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
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
    "password" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
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
    "title" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "metadata" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "metadata" JSONB,
    "model" TEXT,
    "tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "feedbackComment" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_prices" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "tier" "ModelTier" NOT NULL,
    "category" TEXT,
    "inputPricePer1m" DOUBLE PRECISION NOT NULL,
    "outputPricePer1m" DOUBLE PRECISION NOT NULL,
    "contextWindow" INTEGER NOT NULL,
    "recommendedMaxTokens" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_prices_pkey" PRIMARY KEY ("id")
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
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isInBeta" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "dangerLevel" TEXT DEFAULT 'safe',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_tools" (
    "id" TEXT NOT NULL,
    "toolCatalogId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentialPath" TEXT,
    "config" JSONB,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "connectionError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "oauthProvider" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "tenant_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "scopes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

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
    "toolPermissions" JSONB,
    "category" "WorkflowCategory" NOT NULL,
    "maxTokensPerExecution" INTEGER NOT NULL,
    "maxMessages" INTEGER,
    "inactivityHours" INTEGER,
    "maxCostPerConversation" DOUBLE PRECISION,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "triggerType" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeout" INTEGER NOT NULL DEFAULT 300,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "totalCreditsConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "errorStack" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "triggerData" JSONB,
    "logs" TEXT,
    "stepResults" JSONB,
    "cost" DOUBLE PRECISION DEFAULT 0,
    "credits" INTEGER DEFAULT 0,
    "tokensUsed" INTEGER,
    "balanceBefore" DOUBLE PRECISION,
    "balanceAfter" DOUBLE PRECISION,
    "wasOverage" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
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
    "connectionStatus" TEXT NOT NULL DEFAULT 'disconnected',
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
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_deletedAt_idx" ON "organizations"("deletedAt");

-- CreateIndex
CREATE INDEX "organizations_isActive_idx" ON "organizations"("isActive");

-- CreateIndex
CREATE INDEX "organizations_plan_idx" ON "organizations"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_idx" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "credit_balances_organizationId_key" ON "credit_balances"("organizationId");

-- CreateIndex
CREATE INDEX "credit_balances_organizationId_idx" ON "credit_balances"("organizationId");

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
CREATE INDEX "credit_transactions_executionId_idx" ON "credit_transactions"("executionId");

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
CREATE INDEX "invoices_stripeInvoiceId_idx" ON "invoices"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

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
CREATE INDEX "conversations_closedAt_idx" ON "conversations"("closedAt");

-- CreateIndex
CREATE INDEX "conversations_workflowId_status_lastMessageAt_idx" ON "conversations"("workflowId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_role_idx" ON "messages"("role");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "model_prices_provider_modelName_isActive_idx" ON "model_prices"("provider", "modelName", "isActive");

-- CreateIndex
CREATE INDEX "model_prices_isActive_effectiveFrom_idx" ON "model_prices"("isActive", "effectiveFrom");

-- CreateIndex
CREATE INDEX "model_prices_tier_isActive_idx" ON "model_prices"("tier", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "model_prices_provider_modelName_effectiveFrom_key" ON "model_prices"("provider", "modelName", "effectiveFrom");

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
CREATE INDEX "tenant_tools_organizationId_idx" ON "tenant_tools"("organizationId");

-- CreateIndex
CREATE INDEX "tenant_tools_toolCatalogId_idx" ON "tenant_tools"("toolCatalogId");

-- CreateIndex
CREATE INDEX "tenant_tools_isConnected_idx" ON "tenant_tools"("isConnected");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_tools_organizationId_displayName_key" ON "tenant_tools"("organizationId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

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
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_functions" ADD CONSTRAINT "tool_functions_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "tool_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "tool_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tools" ADD CONSTRAINT "tenant_tools_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "_WorkflowToTenantTool" ADD CONSTRAINT "_WorkflowToTenantTool_A_fkey" FOREIGN KEY ("A") REFERENCES "tenant_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkflowToTenantTool" ADD CONSTRAINT "_WorkflowToTenantTool_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWorkflow" ADD CONSTRAINT "_TagToWorkflow_A_fkey" FOREIGN KEY ("A") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWorkflow" ADD CONSTRAINT "_TagToWorkflow_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
