import AuthApi from './identity/auth/auth-api';
import WorkflowsApi from './automation/workflows/workflows-api';
import ConversationsApi from './messaging/conversations/conversations-api';
import ApiKeysApi from './identity/api-keys/api-keys-api';
import EndUsersApi from './identity/end-users/end-users-api';
import UsersApi from './identity/users/users-api';
import ExecutionsApi from './automation/executions/executions-api';
import BillingApi from './billing/billing-api';
import InvoiceApi from './billing/invoice-api';
import OrganizationsApi from './identity/organizations/organizations-api';
import NotificationsApi from './messaging/notifications/notifications-api';
import SupportApi from './platform/support/support-api';
import BookingApi from './platform/booking/booking-api';
import ToolCatalogApi from './automation/tools/tool-catalog-api';
import TenantToolsApi from './automation/tools/tenant-tools-api';
import ToolsOauthApi from './automation/tools/tools-oauth-api';
import WhatsappConfigApi from './messaging/whatsapp-config/whatsapp-config';
import MessengerConfigApi from './messaging/messenger-config/messenger-config';
import LlmModelsApi from './automation/llm-models/llm-models-api';
import WorkflowsAdminApi from './automation/workflows/workflows-admin-api';
import OrganizationsAdminApi from './identity/organizations/organizations-admin-api';
import LlmCategoriesApi from './automation/llm-models/llm-categories-api';
import DatasetsApi from './automation/datasets/datasets-api';
import CreditsAdminApi from './billing/credits-admin-api';
import SubscriptionAdminApi from './billing/subscription-admin-api';
import ConversationsAdminApi from './messaging/conversations/conversations-admin-api';
import WhatsappConfigAdminApi from './messaging/whatsapp-config/whatsapp-config-admin-api';
import TenantToolsAdminApi from './automation/tools/tenant-tools-admin-api';
import AnalyticsAdminApi from './billing/analytics-admin-api';
import DatasetsAdminApi from './automation/datasets/datasets-admin-api';
import AnnouncementsApi from './platform/announcements/announcements-api';
import AnnouncementsAdminApi from './platform/announcements/announcements-admin-api';

class RootApi {
  private static instance: RootApi;
  private authApi: AuthApi;
  private workflowsApi: WorkflowsApi;
  private conversationsApi: ConversationsApi;
  private apiKeysApi: ApiKeysApi;
  private endUsersApi: EndUsersApi;
  private usersApi: UsersApi;
  private executionsApi: ExecutionsApi;
  private billingApi: BillingApi;
  private invoiceApi: InvoiceApi;
  private organizationsApi: OrganizationsApi;
  private notificationsApi: NotificationsApi;
  private supportApi: SupportApi;
  private bookingApi: BookingApi;
  private toolCatalogApi: ToolCatalogApi;
  private tenantToolsApi: TenantToolsApi;
  private toolsOauthApi: ToolsOauthApi;
  private whatsappConfigApi: WhatsappConfigApi;
  private messengerConfigApi: MessengerConfigApi;
  private llmModelsApi: LlmModelsApi;
  private workflowsAdminApi: WorkflowsAdminApi;
  private organizationsAdminApi: OrganizationsAdminApi;
  private llmCategoriesApi: LlmCategoriesApi;
  private datasetsApi: DatasetsApi;
  private creditsAdminApi: CreditsAdminApi;
  private subscriptionAdminApi: SubscriptionAdminApi;
  private conversationsAdminApi: ConversationsAdminApi;
  private whatsappConfigAdminApi: WhatsappConfigAdminApi;
  private tenantToolsAdminApi: TenantToolsAdminApi;
  private analyticsAdminApi: AnalyticsAdminApi;
  private datasetsAdminApi: DatasetsAdminApi;
  private announcementsApi: AnnouncementsApi;
  private announcementsAdminApi: AnnouncementsAdminApi;

  private constructor() {
    this.authApi = new AuthApi();
    this.workflowsApi = new WorkflowsApi();
    this.conversationsApi = new ConversationsApi();
    this.apiKeysApi = new ApiKeysApi();
    this.endUsersApi = new EndUsersApi();
    this.usersApi = new UsersApi();
    this.executionsApi = new ExecutionsApi();
    this.billingApi = new BillingApi();
    this.invoiceApi = new InvoiceApi();
    this.organizationsApi = new OrganizationsApi();
    this.notificationsApi = new NotificationsApi();
    this.supportApi = new SupportApi();
    this.bookingApi = new BookingApi();
    this.toolCatalogApi = new ToolCatalogApi();
    this.tenantToolsApi = new TenantToolsApi();
    this.toolsOauthApi = new ToolsOauthApi();
    this.whatsappConfigApi = new WhatsappConfigApi();
    this.messengerConfigApi = new MessengerConfigApi();
    this.llmModelsApi = new LlmModelsApi();
    this.workflowsAdminApi = new WorkflowsAdminApi();
    this.organizationsAdminApi = new OrganizationsAdminApi();
    this.llmCategoriesApi = new LlmCategoriesApi();
    this.datasetsApi = new DatasetsApi();
    this.creditsAdminApi = new CreditsAdminApi();
    this.subscriptionAdminApi = new SubscriptionAdminApi();
    this.conversationsAdminApi = new ConversationsAdminApi();
    this.whatsappConfigAdminApi = new WhatsappConfigAdminApi();
    this.tenantToolsAdminApi = new TenantToolsAdminApi();
    this.analyticsAdminApi = new AnalyticsAdminApi();
    this.datasetsAdminApi = new DatasetsAdminApi();
    this.announcementsApi = new AnnouncementsApi();
    this.announcementsAdminApi = new AnnouncementsAdminApi();
  }

  public static getInstance(): RootApi {
    if (!RootApi.instance) {
      RootApi.instance = new RootApi();
    }
    return RootApi.instance;
  }

  public getAuthApi(): AuthApi {
    return this.authApi;
  }

  public getWorkflowsApi(): WorkflowsApi {
    return this.workflowsApi;
  }

  public getConversationsApi(): ConversationsApi {
    return this.conversationsApi;
  }

  public getApiKeysApi(): ApiKeysApi {
    return this.apiKeysApi;
  }

  public getEndUsersApi(): EndUsersApi {
    return this.endUsersApi;
  }

  public getUsersApi(): UsersApi {
    return this.usersApi;
  }

  public getExecutionsApi(): ExecutionsApi {
    return this.executionsApi;
  }

  public getBillingApi(): BillingApi {
    return this.billingApi;
  }

  public getInvoiceApi(): InvoiceApi {
    return this.invoiceApi;
  }

  public getOrganizationsApi(): OrganizationsApi {
    return this.organizationsApi;
  }

  public getNotificationsApi(): NotificationsApi {
    return this.notificationsApi;
  }

  public getSupportApi(): SupportApi {
    return this.supportApi;
  }

  public getBookingApi(): BookingApi {
    return this.bookingApi;
  }

  public getToolCatalogApi(): ToolCatalogApi {
    return this.toolCatalogApi;
  }

  public getTenantToolsApi(): TenantToolsApi {
    return this.tenantToolsApi;
  }

  public getToolsOauthApi(): ToolsOauthApi {
    return this.toolsOauthApi;
  }

  public getWhatsappConfigApi(): WhatsappConfigApi {
    return this.whatsappConfigApi;
  }

  public getMessengerConfigApi(): MessengerConfigApi {
    return this.messengerConfigApi;
  }

  public getWorkflowsAdminApi(): WorkflowsAdminApi {
    return this.workflowsAdminApi;
  }

  public getOrganizationsAdminApi(): OrganizationsAdminApi {
    return this.organizationsAdminApi;
  }

  public getLlmModelsApi(): LlmModelsApi {
    return this.llmModelsApi;
  }

  public getLlmCategoriesApi(): LlmCategoriesApi {
    return this.llmCategoriesApi;
  }

  public getDatasetsApi(): DatasetsApi {
    return this.datasetsApi;
  }

  public getCreditsAdminApi(): CreditsAdminApi {
    return this.creditsAdminApi;
  }

  public getSubscriptionAdminApi(): SubscriptionAdminApi {
    return this.subscriptionAdminApi;
  }

  public getConversationsAdminApi(): ConversationsAdminApi {
    return this.conversationsAdminApi;
  }

  public getWhatsappConfigAdminApi(): WhatsappConfigAdminApi {
    return this.whatsappConfigAdminApi;
  }

  public getTenantToolsAdminApi(): TenantToolsAdminApi {
    return this.tenantToolsAdminApi;
  }

  public getAnalyticsAdminApi(): AnalyticsAdminApi {
    return this.analyticsAdminApi;
  }

  public getDatasetsAdminApi(): DatasetsAdminApi {
    return this.datasetsAdminApi;
  }

  public getAnnouncementsApi(): AnnouncementsApi {
    return this.announcementsApi;
  }

  public getAnnouncementsAdminApi(): AnnouncementsAdminApi {
    return this.announcementsAdminApi;
  }
}

export default RootApi;
