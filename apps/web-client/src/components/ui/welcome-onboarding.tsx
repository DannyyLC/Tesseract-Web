'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { triggerWowConfetti } from '@/lib/confetti';
import { toast } from 'sonner';

export function WelcomeOnboarding() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasTriggered = useRef(false);

  useEffect(() => {
    // 1. Verificamos si el parámetro welcome=true está presente
    const isWelcome = searchParams.get('welcome') === 'true';
    if (!isWelcome) return;

    // 2. Prevenimos ejecuciones dobles en React Strict Mode (y en navegaciones raras)
    if (hasTriggered.current) return;

    // 3. Revisamos en localStorage si ya se le dio la bienvenida a este usuario antes.
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    
    // 4. Limpiamos la URL independientemente de si vemos la animación o no
    // para mantener la barra de direcciones limpia.
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete('welcome');
    const newQuery = newSearchParams.toString();
    const newUrl = pathname + (newQuery ? `?${newQuery}` : '');
    router.replace(newUrl, { scroll: false });

    if (hasSeenWelcome === 'true') {
      return; // Ya fue bienvenido previamente, no hacemos nada más.
    }

    // Marcamos que ya se le dio la bienvenida
    localStorage.setItem('hasSeenWelcome', 'true');
    hasTriggered.current = true;

    // 5. Efecto WOW: Confetti
    triggerWowConfetti();

    // 6. Toast elegante de Sonner
    setTimeout(() => {
      toast.success('¡Bienvenido a Tesseract!', {
        description: 'Gracias por confiar en el equipo de Fractal. Estás listo para empezar a automatizar el futuro de tu negocio.',
        duration: 8000,
        position: 'top-center',
      });
    }, 500);

  }, [searchParams, router, pathname]);

  return null;
}
