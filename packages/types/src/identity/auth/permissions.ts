export type AppPermission =
  | 'api_keys:read'
  | 'api_keys:create'
  | 'api_keys:update'
  | 'api_keys:delete'
  | 'tools_catalog:read'
  | 'workflows:read'
  | 'workflows:create'
  | 'workflows:update'
  | 'workflows:delete'
  | 'workflows:execute'
  | 'users:read'
  | 'users:update'
  | 'users:delete'
  | 'users:transfer_ownership'
  | 'end_users:read'
  | 'end_users:block'
  | 'executions:read'
  | 'executions:cancel'
  | 'executions:delete'
  | 'organization:read'
  | 'organization:update'
  | 'organization:delete'
  | 'organization:invite_user'
  | 'organization:resend_invitation'
  | 'organization:cancel_invitation'
  | 'tenant_tools:read'
  | 'tenant_tools:create'
  | 'tenant_tools:update'
  | 'tenant_tools:delete'
  | 'tenant_tools:add_workflows'
  | 'tenant_tools:remove_workflows'
  | 'tenant_tools:disconnect'
  | 'datasets:read'
  | 'datasets:create'
  | 'datasets:update'
  | 'datasets:delete'
  | 'notifications:read'
  | 'notifications:update'
  | 'notifications:delete'
  | 'support:request'
  | 'conversations:read'
  | 'conversations:update'
  | 'conversations:delete'
  | 'invoice:read'
  | 'fiscal_profile:read'
  | 'fiscal_profile:update'
  | 'billing:read'
  | 'billing:checkout'
  | 'billing:update_plan'
  | 'billing:cancel_subscription'
  | 'billing:update_overages';

export const ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  OWNER: [
    'api_keys:read',
    'api_keys:create',
    'api_keys:update',
    'api_keys:delete',

    'tools_catalog:read',

    'workflows:read',
    'workflows:create',
    'workflows:update',
    'workflows:delete',
    'workflows:execute',

    'users:read',
    'users:update',
    'users:delete',
    'users:transfer_ownership',

    'end_users:read',
    'end_users:block',

    'executions:read',
    'executions:cancel',
    'executions:delete',

    'organization:read',
    'organization:update',
    'organization:delete',
    'organization:invite_user',
    'organization:resend_invitation',
    'organization:cancel_invitation',

    'tenant_tools:read',
    'tenant_tools:create',
    'tenant_tools:update',
    'tenant_tools:delete',
    'tenant_tools:add_workflows',
    'tenant_tools:remove_workflows',
    'tenant_tools:disconnect',

    'datasets:read',
    'datasets:create',
    'datasets:update',
    'datasets:delete',

    'notifications:read',
    'notifications:update',
    'notifications:delete',

    'support:request',

    'conversations:read',
    'conversations:update',
    'conversations:delete',

    'invoice:read',

    // Los datos fiscales solo los edita el Owner: un RFC equivocado no rompe la aplicación,
    // rompe la factura ante el SAT, y corregirlo después de timbrar exige cancelar.
    'fiscal_profile:read',
    'fiscal_profile:update',

    'billing:read',
    'billing:checkout',
    'billing:update_plan',
    'billing:cancel_subscription',
    'billing:update_overages',
  ],
  ADMIN: [
    'api_keys:read',
    'api_keys:create',
    'api_keys:update',
    'api_keys:delete',

    'tools_catalog:read',

    'workflows:read',
    'workflows:create',
    'workflows:update',
    'workflows:delete',
    'workflows:execute',

    'users:read',
    'users:update',
    'users:delete',

    'end_users:read',
    'end_users:block',

    'executions:read',
    'executions:cancel',
    'executions:delete',

    'organization:read',
    'organization:update',
    'organization:invite_user',
    'organization:resend_invitation',
    'organization:cancel_invitation',

    'tenant_tools:read',
    'tenant_tools:create',
    'tenant_tools:update',
    'tenant_tools:delete',
    'tenant_tools:add_workflows',
    'tenant_tools:remove_workflows',
    'tenant_tools:disconnect',

    'datasets:read',
    'datasets:create',
    'datasets:update',
    'datasets:delete',

    'notifications:read',
    'notifications:update',
    'notifications:delete',

    'support:request',

    'conversations:read',
    'conversations:update',
    'conversations:delete',

    'invoice:read',

    'fiscal_profile:read',

    'billing:read',
    'billing:update_overages',
  ],
  VIEWER: [
    'api_keys:read',

    'tools_catalog:read',

    'workflows:read',
    'workflows:execute',

    'end_users:read',

    'executions:read',

    'organization:read',

    'tenant_tools:read',

    'datasets:read',

    'notifications:read',
    'notifications:update',
    'notifications:delete',

    'support:request',

    'conversations:read',
    'conversations:update',

    'invoice:read',
  ],
};
