'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/routing';

// /admin no tiene contenido propio: redirige a la primera herramienta.
export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/llm-models');
  }, [router]);
  return null;
}
