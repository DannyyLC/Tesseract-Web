import AuthApi from './identity/auth/auth-api';
import WorkflowsApi from './automation/workflows/workflows-api';
import ConversationsApi from './messaging/conversations/conversations-api';
import ApiKeysApi from './identity/api-keys/api-keys-api';
import UsersApi from './identity/users/users-api';
import ExecutionsApi from './automation/executions/executions-api';
import BillingApi from './billing/billing-api';
import OrganizationsApi from './identity/organizations/organizations-api';
import NotificationsApi from './messaging/notifications/notifications-api';
import SupportApi from './platform/support/support-api';
import ToolCatalogApi from './automation/tools/tool-catalog-api';
import TenantToolsApi from './automation/tools/tenant-tools-api';
import ToolsOauthApi from './automation/tools/tools-oauth-api';
import WhatsappConfigApi from './messaging/whatsapp-config/whatsapp-config';
import MessengerConfigApi from './messaging/messenger-config/messenger-config';
import LlmModelsApi from './automation/llm-models/llm-models-api';
import WorkflowsAdminApi from './automation/workflows/workflows-admin-api';
import OrganizationsAdminApi from './identity/organizations/organizations-admin-api';
import LlmCategoriesApi from './automation/llm-models/llm-categories-api';

class RootApi {
  private static instance: RootApi;
  private authApi: AuthApi;
  private workflowsApi: WorkflowsApi;
  private conversationsApi: ConversationsApi;
  private apiKeysApi: ApiKeysApi;
  private usersApi: UsersApi;
  private executionsApi: ExecutionsApi;
  private billingApi: BillingApi;
  private organizationsApi: OrganizationsApi;
  private notificationsApi: NotificationsApi;
  private supportApi: SupportApi;
  private toolCatalogApi: ToolCatalogApi;
  private tenantToolsApi: TenantToolsApi;
  private toolsOauthApi: ToolsOauthApi;
  private whatsappConfigApi: WhatsappConfigApi;
  private messengerConfigApi: MessengerConfigApi;
  private llmModelsApi: LlmModelsApi;
  private workflowsAdminApi: WorkflowsAdminApi;
  private organizationsAdminApi: OrganizationsAdminApi;
  private llmCategoriesApi: LlmCategoriesApi;

  private constructor() {
    this.authApi = new AuthApi();
    this.workflowsApi = new WorkflowsApi();
    this.conversationsApi = new ConversationsApi();
    this.apiKeysApi = new ApiKeysApi();
    this.usersApi = new UsersApi();
    this.executionsApi = new ExecutionsApi();
    this.billingApi = new BillingApi();
    this.organizationsApi = new OrganizationsApi();
    this.notificationsApi = new NotificationsApi();
    this.supportApi = new SupportApi();
    this.toolCatalogApi = new ToolCatalogApi();
    this.tenantToolsApi = new TenantToolsApi();
    this.toolsOauthApi = new ToolsOauthApi();
    this.whatsappConfigApi = new WhatsappConfigApi();
    this.messengerConfigApi = new MessengerConfigApi();
    this.llmModelsApi = new LlmModelsApi();
    this.workflowsAdminApi = new WorkflowsAdminApi();
    this.organizationsAdminApi = new OrganizationsAdminApi();
    this.llmCategoriesApi = new LlmCategoriesApi();
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

  public getUsersApi(): UsersApi {
    return this.usersApi;
  }

  public getExecutionsApi(): ExecutionsApi {
    return this.executionsApi;
  }

  public getBillingApi(): BillingApi {
    return this.billingApi;
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
}

export default RootApi;
