'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { AppPermission, ROLE_PERMISSIONS } from '@tesseract/types';

interface PermissionGuardProps {
  children: React.ReactNode;
  /**
   * List of permissions required to render the children or access the route.
   * If an array is provided, the user needs to have AT LEAST ONE of the permissions (OR condition).
   */
  permissions: AppPermission | AppPermission[];
  /**
   * If true, it redirects to the fallback route when permission is denied.
   * If false, it simply hides the component (renders null). Use false for inline UI elements like buttons.
   */
  redirect?: boolean;
  /**
   * The route to redirect to if permission is denied.
   */
  fallbackRoute?: string;
  /**
   * Require ALL permissions instead of just one if an array is provided (AND condition).
   */
  requireAll?: boolean;
}

export default function PermissionGuard({
  children,
  permissions,
  redirect = false,
  fallbackRoute = '/dashboard',
  requireAll = false,
}: PermissionGuardProps) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();

  // Normalize permissions to an array
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

  const hasPermission = () => {
    if (!user || !user.role) return false;

    // Get the permissions for the user's role from the shared map
    const userRolePermissions = ROLE_PERMISSIONS[user.role] || [];

    if (requireAll) {
      // Must have ALL required permissions
      return requiredPermissions.every((perm) => userRolePermissions.includes(perm));
    } else {
      // Must have AT LEAST ONE required permission
      return requiredPermissions.some((perm) => userRolePermissions.includes(perm));
    }
  };

  const allowed = hasPermission();

  useEffect(() => {
    if (!redirect || isLoading) return;

    if (!user) {
      // Redirect to login if completely unauthenticated
      router.push('/login');
    } else if (!allowed) {
      // Redirect to fallback if authenticated but lacks permission
      router.push(fallbackRoute);
    }
  }, [user, isLoading, router, redirect, fallbackRoute, allowed]);

  // Handle loading state only if it's a route guard (redirect = true)
  if (isLoading && redirect) {
    return <LogoLoader text="Verificando permisos" />;
  }

  // Do not block rendering if still loading but not a route guard
  // We prefer to hide buttons until user is fully loaded
  if (isLoading) {
    return null;
  }

  // Render children if permission is granted
  if (allowed) {
    return <>{children}</>;
  }

  // Return null if permission is denied
  return null;
}
