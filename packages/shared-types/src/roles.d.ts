export declare enum UserRole {
    OWNER = "owner",
    ADMIN = "admin",
    VIEWER = "viewer"
}
export declare enum Permission {
    ORGANIZATION_READ = "organization:read",
    ORGANIZATION_UPDATE = "organization:update",
    ORGANIZATION_DELETE = "organization:delete",
    ORGANIZATION_CHANGE_PLAN = "organization:change_plan",
    USERS_READ = "users:read",
    USERS_INVITE = "users:invite",
    USERS_UPDATE_ROLE = "users:update_role",
    USERS_DELETE = "users:delete",
    API_KEYS_READ = "api_keys:read",
    API_KEYS_CREATE = "api_keys:create",
    API_KEYS_UPDATE = "api_keys:update",
    API_KEYS_DELETE = "api_keys:delete",
    WORKFLOWS_READ = "workflows:read",
    WORKFLOWS_CREATE = "workflows:create",
    WORKFLOWS_UPDATE = "workflows:update",
    WORKFLOWS_DELETE = "workflows:delete",
    WORKFLOWS_EXECUTE = "workflows:execute",
    EXECUTIONS_READ = "executions:read",
    EXECUTIONS_CANCEL = "executions:cancel",
    ANALYTICS_READ = "analytics:read",
    ANALYTICS_EXPORT = "analytics:export",
    WHATSAPP_READ = "whatsapp:read",
    WHATSAPP_CREATE = "whatsapp:create",
    WHATSAPP_UPDATE = "whatsapp:update",
    WHATSAPP_DELETE = "whatsapp:delete"
}
export declare const ROLE_PERMISSIONS: Record<UserRole, Permission[]>;
export declare function hasPermission(role: UserRole, permission: Permission): boolean;
export declare function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean;
export declare function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean;
export declare function getRolePermissions(role: UserRole): Permission[];
export declare function isAuthorized(role: UserRole, permission: Permission): boolean;
export declare const ROLE_METADATA: Record<UserRole, {
    label: string;
    description: string;
    color: string;
    icon: string;
}>;
export declare function getRoleMetadata(role: UserRole): {
    label: string;
    description: string;
    color: string;
    icon: string;
};
export declare function canInviteUsers(role: UserRole): boolean;
export declare function canChangePlan(role: UserRole): boolean;
export declare function canManageApiKeys(role: UserRole): boolean;
export declare function canManageWorkflows(role: UserRole): boolean;
//# sourceMappingURL=roles.d.ts.map