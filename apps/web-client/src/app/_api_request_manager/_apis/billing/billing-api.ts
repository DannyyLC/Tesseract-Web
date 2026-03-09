import ApiRequestManager from '../../api_request_manager';
import {
  CheckoutResponse,
  PortalResponse,
  BillingPlan,
  SubscriptionDetails,
  UpdateSubscriptionDto,
  BillingDashboardData,
  SubscriptionPlan,
  ToggleOveragesDto,
} from '@tesseract/types';

class BillingApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/billing';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  /**
   * Creates a Stripe Checkout Session for a subscription.
   * Endpoint: POST /billing/checkout
   */
  public async createCheckoutSession(plan: string | SubscriptionPlan): Promise<CheckoutResponse> {
    const response = await this.apiRequestManager.post<CheckoutResponse>(
      `${BillingApi.BASE_URL}/checkout`,
      { plan },
    );
    return response.data;
  }

  /**
   * Creates a Stripe Customer Portal Session for managing billing.
   * Endpoint: POST /billing/portal
   */
  public async createPortalSession(): Promise<PortalResponse> {
    const response = await this.apiRequestManager.post<PortalResponse>(
      `${BillingApi.BASE_URL}/portal`,
    );
    return response.data;
  }

  /**
   * Retrieves the list of available subscription plans.
   * Endpoint: GET /billing/plans
   */
  public async getPlans(): Promise<BillingPlan[]> {
    const response = await this.apiRequestManager.get<BillingPlan[]>(
      `${BillingApi.BASE_URL}/plans`,
    );
    return response.data;
  }

  /**
   * Retrieves the current subscription details for the organization.
   * Endpoint: GET /billing/subscription
   */
  public async getSubscription(): Promise<SubscriptionDetails> {
    const response = await this.apiRequestManager.get<SubscriptionDetails>(
      `${BillingApi.BASE_URL}/subscription`,
    );
    return response.data;
  }

  /**
   * Updates the subscription plan.
   * Endpoint: PUT /billing/subscription
   */
  public async updateSubscription(plan: SubscriptionPlan): Promise<{ message: string }> {
    const data: UpdateSubscriptionDto = { plan };
    const response = await this.apiRequestManager.put<{ message: string }>(
      `${BillingApi.BASE_URL}/subscription`,
      data,
    );
    return response.data;
  }

  /**
   * Retrieves dashboard data for billing.
   * Endpoint: GET /billing/dashboard
   */
  public async getDashboardData(): Promise<BillingDashboardData> {
    const response = await this.apiRequestManager.get<BillingDashboardData>(
      `${BillingApi.BASE_URL}/dashboard`,
    );
    return response.data;
  }

  /**
   * Cancels the subscription.
   * Endpoint: DELETE /billing/subscription
   */
  public async cancelSubscription(): Promise<{ message: string }> {
    const response = await this.apiRequestManager.delete<{ message: string }>(
      `${BillingApi.BASE_URL}/subscription`,
    );
    return response.data;
  }

  /**
   * Resumes a cancelled subscription before the period ends.
   * Endpoint: PATCH /billing/subscription/resume
   */
  public async resumeSubscription(): Promise<{ message: string }> {
    const response = await this.apiRequestManager.patch<{ message: string }>(
      `${BillingApi.BASE_URL}/subscription/resume`,
    );
    return response.data;
  }

  /**
   * Cancels a pending downgrade scheduled for the end of the period.
   * Endpoint: PATCH /billing/subscription/cancel-downgrade
   */
  public async cancelPendingDowngrade(): Promise<{ message: string }> {
    const response = await this.apiRequestManager.patch<{ message: string }>(
      `${BillingApi.BASE_URL}/subscription/cancel-downgrade`,
    );
    return response.data;
  }

  /**
   * Toggles the overage setting for the organization.
   * Endpoint: PATCH /billing/overages
   */
  public async toggleOverages(
    allowOverages: boolean,
    overageLimit?: number,
  ): Promise<SubscriptionDetails> {
    const data: ToggleOveragesDto = { allowOverages, overageLimit };
    const response = await this.apiRequestManager.patch<SubscriptionDetails>(
      `${BillingApi.BASE_URL}/overages`,
      data,
    );
    return response.data;
  }
}

export default BillingApi;
