// Auto-generated interfaces from schema.prisma (without decorators)

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  defaultMaxMessages?: number;
  defaultInactivityHours?: number;
  defaultMaxCostPerConv?: number;
  allowOverages: boolean;
  overageLimit?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  shardKey?: string;
  region?: string;
  metadata?: any;
  stripeCustomerId?: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customOverageLimit?: number;
  customFeatures?: any;
  createdAt: Date;
  updatedAt: Date;
  canceledAt?: Date;
}

export interface CreditBalance {
  id: string;
  organizationId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  currentMonthSpent: number;
  currentMonthCostUSD: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditTransaction {
  id: string;
  organizationId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  subscriptionId?: string;
  executionId?: string;
  invoiceId?: string;
  workflowCategory?: string;
  costUSD?: number;
  description?: string;
  metadata?: any;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  type: string;
  status: string;
  subscriptionId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  subtotal: number;
  overageCredits: number;
  overageAmount: number;
  tax: number;
  total: number;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
  stripeHostedUrl?: string;
  stripePdfUrl?: string;
  paidAt?: Date;
  dueAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  lastLoginAt?: Date;
  avatar?: string;
  timezone?: string;
  organizationId: string;
}

export interface EndUser {
  id: string;
  phoneNumber?: string;
  email?: string;
  externalId?: string;
  sessionId?: string;
  name?: string;
  avatar?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt?: Date;
  organizationId: string;
}

export interface Conversation {
  id: string;
  userId?: string;
  endUserId?: string;
  workflowId: string;
  whatsappConfigId?: string;
  title?: string;
  channel: string;
  status: string;
  messageCount: number;
  totalTokens: number;
  totalCost: number;
  lastMessageAt?: Date;
  metadata?: any;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  attachments?: any;
  metadata?: any;
  model?: string;
  tokens?: number;
  cost?: number;
  latencyMs?: number;
  toolCalls?: any;
  toolResults?: any;
  createdAt: Date;
  feedback?: string;
  feedbackComment?: string;
}

export interface LlmModel {
  id: string;
  provider: string;
  modelName: string;
  tier: string;
  category?: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  contextWindow: number;
  recommendedMaxTokens: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolCatalog {
  id: string;
  toolName: string;
  displayName: string;
  description?: string;
  provider?: string;
  isActive: boolean;
  isInBeta: boolean;
  icon?: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolFunction {
  id: string;
  toolCatalogId: string;
  functionName: string;
  displayName: string;
  description?: string;
  category?: string;
  isActive: boolean;
  isInBeta: boolean;
  icon?: string;
  dangerLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantTool {
  id: string;
  toolCatalogId: string;
  displayName: string;
  credentialPath?: string;
  config?: any;
  isConnected: boolean;
  connectionError?: string;
  connectedAt?: Date;
  lastUsedAt?: Date;
  oauthProvider?: string;
  tokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
}

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyHash: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  scopes?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  organizationId: string;
}

export interface RefreshToken {
  id: string;
  tokenHash: string;
  familyId: string;
  previousTokenHash?: string;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  createdAt: Date;
  lastUsedAt: Date;
  userId: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  config: any;
  category: string;
  maxTokensPerExecution: number;
  maxMessages?: number;
  inactivityHours?: number;
  maxCostPerConversation?: number;
  version: number;
  isActive: boolean;
  isPaused: boolean;
  schedule?: string;
  timezone?: string;
  triggerType: string[];
  timeout: number;
  maxRetries: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalCreditsConsumed: number;
  avgCreditsPerExecution?: number;
  lastExecutedAt?: Date;
  avgExecutionTime?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  organizationId: string;
}

export interface Execution {
  id: string;
  status: string;
  startedAt: Date;
  finishedAt?: Date;
  duration?: number;
  result?: any;
  error?: string;
  errorStack?: string;
  trigger: string;
  triggerData?: any;
  logs?: string;
  stepResults?: any;
  cost?: number;
  credits?: number;
  tokensUsed?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  wasOverage: boolean;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  workflowId: string;
  organizationId: string;
  conversationId?: string;
  userId?: string;
  apiKeyId?: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
}

export interface WhatsAppConfig {
  id: string;
  phoneNumber: string;
  displayName?: string;
  description?: string;
  provider: string;
  credentialPath?: string;
  webhookSecret: string;
  webhookUrl?: string;
  connectionStatus: string;
  lastConnectedAt?: Date;
  connectionError?: string;
  qrCode?: string;
  qrCodeExpiry?: Date;
  sessionData?: any;
  isActive: boolean;
  defaultWorkflowId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  organizationId: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userEmail: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  endpoint: string;
  changes?: any;
  metadata?: any;
  ipAddress: string;
  userAgent?: string;
  statusCode: number;
  success: boolean;
  errorMessage?: string;
  duration?: number;
  timestamp: Date;
  organizationId?: string;
}
