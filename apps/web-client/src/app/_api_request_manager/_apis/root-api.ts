import AuthApi from './auth/auth-api';
import WorkflowsApi from './workflows/workflows-api';
import ConversationsApi from './converstaions/conversations-api';
import ApiKeysApi from './api-keys/api-keys-api';
import UsersApi from './users/users-api';
import ExecutionsApi from './executions/executions-api';
import BillingApi from './billing/billing-api';
import OrganizationsApi from './organizations/organizations-api';
import NotificationsApi from './notifications/notifications-api';
import SupportApi from './support/support-api';
import ToolCatalogApi from './tools/tool-catalog-api';
import TenantToolsApi from './tools/tenant-tools-api';
import ToolsOauthApi from './tools/tools-oauth-api';
import WhatsappConfigApi from './whatsapp-config/whatsapp-config';

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
}

export default RootApi;
