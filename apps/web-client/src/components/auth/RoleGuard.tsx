'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoLoader } from '@/components/ui/logo-loader';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  redirect?: boolean;
}

export default function RoleGuard({ children, allowedRoles, redirect = true }: RoleGuardProps) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!redirect) return;

    if (!isLoading && user) {
      if (!allowedRoles.includes(user.role)) {
        // Redirect to dashboard if user doesn't have required role
        router.push('/dashboard');
      }
    } else if (!isLoading && !user) {
      // Redirect to login if not authenticated
      router.push('/login');
    }
  }, [user, isLoading, router, allowedRoles, redirect]);

  if (isLoading) {
    return redirect ? <LogoLoader text="Verificando permisos" /> : null;
  }

  // Verify role before rendering children to prevent flash of content
  if (user && allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  // Return null if not allowed
  return null;
}
