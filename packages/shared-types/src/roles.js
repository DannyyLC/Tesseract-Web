"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_METADATA = exports.ROLE_PERMISSIONS = exports.Permission = exports.UserRole = void 0;
exports.hasPermission = hasPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.hasAnyPermission = hasAnyPermission;
exports.getRolePermissions = getRolePermissions;
exports.isAuthorized = isAuthorized;
exports.getRoleMetadata = getRoleMetadata;
exports.canInviteUsers = canInviteUsers;
exports.canChangePlan = canChangePlan;
exports.canManageApiKeys = canManageApiKeys;
exports.canManageWorkflows = canManageWorkflows;
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "owner";
    UserRole["ADMIN"] = "admin";
    UserRole["VIEWER"] = "viewer";
})(UserRole || (exports.UserRole = UserRole = {}));
var Permission;
(function (Permission) {
    Permission["ORGANIZATION_READ"] = "organization:read";
    Permission["ORGANIZATION_UPDATE"] = "organization:update";
    Permission["ORGANIZATION_DELETE"] = "organization:delete";
    Permission["ORGANIZATION_CHANGE_PLAN"] = "organization:change_plan";
    Permission["USERS_READ"] = "users:read";
    Permission["USERS_INVITE"] = "users:invite";
    Permission["USERS_UPDATE_ROLE"] = "users:update_role";
    Permission["USERS_DELETE"] = "users:delete";
    Permission["API_KEYS_READ"] = "api_keys:read";
    Permission["API_KEYS_CREATE"] = "api_keys:create";
    Permission["API_KEYS_UPDATE"] = "api_keys:update";
    Permission["API_KEYS_DELETE"] = "api_keys:delete";
    Permission["WORKFLOWS_READ"] = "workflows:read";
    Permission["WORKFLOWS_CREATE"] = "workflows:create";
    Permission["WORKFLOWS_UPDATE"] = "workflows:update";
    Permission["WORKFLOWS_DELETE"] = "workflows:delete";
    Permission["WORKFLOWS_EXECUTE"] = "workflows:execute";
    Permission["EXECUTIONS_READ"] = "executions:read";
    Permission["EXECUTIONS_CANCEL"] = "executions:cancel";
    Permission["ANALYTICS_READ"] = "analytics:read";
    Permission["ANALYTICS_EXPORT"] = "analytics:export";
    Permission["WHATSAPP_READ"] = "whatsapp:read";
    Permission["WHATSAPP_CREATE"] = "whatsapp:create";
    Permission["WHATSAPP_UPDATE"] = "whatsapp:update";
    Permission["WHATSAPP_DELETE"] = "whatsapp:delete";
})(Permission || (exports.Permission = Permission = {}));
exports.ROLE_PERMISSIONS = {
    [UserRole.OWNER]: [
        Permission.ORGANIZATION_READ,
        Permission.ORGANIZATION_UPDATE,
        Permission.ORGANIZATION_DELETE,
        Permission.ORGANIZATION_CHANGE_PLAN,
        Permission.USERS_READ,
        Permission.USERS_INVITE,
        Permission.USERS_UPDATE_ROLE,
        Permission.USERS_DELETE,
        Permission.API_KEYS_READ,
        Permission.API_KEYS_CREATE,
        Permission.API_KEYS_UPDATE,
        Permission.API_KEYS_DELETE,
        Permission.WORKFLOWS_READ,
        Permission.WORKFLOWS_CREATE,
        Permission.WORKFLOWS_UPDATE,
        Permission.WORKFLOWS_DELETE,
        Permission.WORKFLOWS_EXECUTE,
        Permission.EXECUTIONS_READ,
        Permission.EXECUTIONS_CANCEL,
        Permission.ANALYTICS_READ,
        Permission.ANALYTICS_EXPORT,
        Permission.WHATSAPP_READ,
        Permission.WHATSAPP_CREATE,
        Permission.WHATSAPP_UPDATE,
        Permission.WHATSAPP_DELETE,
    ],
    [UserRole.ADMIN]: [
        Permission.ORGANIZATION_READ,
        Permission.USERS_READ,
        Permission.API_KEYS_READ,
        Permission.API_KEYS_CREATE,
        Permission.API_KEYS_UPDATE,
        Permission.API_KEYS_DELETE,
        Permission.WORKFLOWS_READ,
        Permission.WORKFLOWS_CREATE,
        Permission.WORKFLOWS_UPDATE,
        Permission.WORKFLOWS_DELETE,
        Permission.WORKFLOWS_EXECUTE,
        Permission.EXECUTIONS_READ,
        Permission.EXECUTIONS_CANCEL,
        Permission.ANALYTICS_READ,
        Permission.ANALYTICS_EXPORT,
        Permission.WHATSAPP_READ,
        Permission.WHATSAPP_CREATE,
        Permission.WHATSAPP_UPDATE,
        Permission.WHATSAPP_DELETE,
    ],
    [UserRole.VIEWER]: [
        Permission.ORGANIZATION_READ,
        Permission.USERS_READ,
        Permission.API_KEYS_READ,
        Permission.WORKFLOWS_READ,
        Permission.EXECUTIONS_READ,
        Permission.ANALYTICS_READ,
        Permission.WHATSAPP_READ,
    ],
};
function hasPermission(role, permission) {
    return exports.ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
function hasAllPermissions(role, permissions) {
    return permissions.every(permission => hasPermission(role, permission));
}
function hasAnyPermission(role, permissions) {
    return permissions.some(permission => hasPermission(role, permission));
}
function getRolePermissions(role) {
    return exports.ROLE_PERMISSIONS[role] ?? [];
}
function isAuthorized(role, permission) {
    return hasPermission(role, permission);
}
exports.ROLE_METADATA = {
    [UserRole.OWNER]: {
        label: 'Owner',
        description: 'Dueño de la organización con acceso total y permisos de facturación',
        color: '#8B5CF6',
        icon: '👑',
    },
    [UserRole.ADMIN]: {
        label: 'Admin',
        description: 'Administrador con permisos para gestionar workflows, API keys y analytics',
        color: '#3B82F6',
        icon: '⚙️',
    },
    [UserRole.VIEWER]: {
        label: 'Viewer',
        description: 'Solo lectura, puede ver workflows y reportes sin modificarlos',
        color: '#10B981',
        icon: '👁️',
    },
};
function getRoleMetadata(role) {
    return exports.ROLE_METADATA[role];
}
function canInviteUsers(role) {
    return hasPermission(role, Permission.USERS_INVITE);
}
function canChangePlan(role) {
    return hasPermission(role, Permission.ORGANIZATION_CHANGE_PLAN);
}
function canManageApiKeys(role) {
    return hasPermission(role, Permission.API_KEYS_CREATE);
}
function canManageWorkflows(role) {
    return hasPermission(role, Permission.WORKFLOWS_CREATE);
}
//# sourceMappingURL=roles.js.map