'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoLoader } from '@/components/ui/logo-loader';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export default function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      if (!allowedRoles.includes(user.role)) {
        // Redirect to dashboard if user doesn't have required role
        router.push('/dashboard');
      }
    } else if (!isLoading && !user) {
      // Redirect to login if not authenticated
      router.push('/login');
    }
  }, [user, isLoading, router, allowedRoles]);

  if (isLoading) {
    return (
      <LogoLoader text="Verificando permisos" />
    );
  }

  // Verify role before rendering children to prevent flash of content
  if (user && allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  // Return null while redirecting
  return null;
}
