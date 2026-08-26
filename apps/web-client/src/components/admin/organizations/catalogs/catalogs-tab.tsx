'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { DatasetDetail } from './dataset-detail';
import { DatasetList } from './dataset-list';

interface CatalogsTabProps {
  organizationId: string;
}

/**
 * Tab "Catálogos" del detalle de organización. Componente delgado: solo decide entre listado y
 * detalle según `?datasetId=` en la URL — la misma técnica que ya usa `?tab=` en la página padre,
 * para que abrir un catálogo sobreviva a un refresh o al botón atrás del navegador.
 */
export function CatalogsTab({ organizationId }: CatalogsTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const datasetId = searchParams.get('datasetId');

  const openDataset = useCallback(
    (id: string | null) => {
      const query = new URLSearchParams(searchParams.toString());
      if (id) {
        query.set('datasetId', id);
      } else {
        query.delete('datasetId');
      }
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (datasetId) {
    return (
      <DatasetDetail
        organizationId={organizationId}
        datasetId={datasetId}
        onBack={() => openDataset(null)}
      />
    );
  }

  return <DatasetList organizationId={organizationId} onSelect={openDataset} />;
}
