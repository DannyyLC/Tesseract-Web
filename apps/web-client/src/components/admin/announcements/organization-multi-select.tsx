'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  /** Vacío = todas las organizaciones — misma convención que usa el backend. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Selector de cero, una o varias organizaciones destino. No reutiliza `InfiniteSelect`
 * (single-value) porque un anuncio puede ir a varias empresas a la vez; en vez de tocar
 * ese componente compartido (usado en ~10 sitios), este es uno propio, con el mismo
 * hook de paginación (`useInfiniteAdminOrganizations`) por debajo.
 */
export function OrganizationMultiSelect({ value, onChange }: Props) {
  // "Todas" es el estado inicial siempre que no vengan ids ya elegidos (edición futura).
  const [mode, setMode] = useState<'all' | 'specific'>(value.length > 0 ? 'specific' : 'all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteAdminOrganizations({ search: search || undefined });

  const organizations = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Los nombres de las seleccionadas se sacan de lo que ya se cargó — siempre están ahí
  // porque se seleccionaron desde esta misma lista, así que nunca falta el nombre.
  const nameById = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  const toggleAll = (allOrgs: boolean) => {
    setMode(allOrgs ? 'all' : 'specific');
    if (allOrgs) onChange([]);
  };

  const toggleOrg = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3">
        <Switch
          checked={mode === 'all'}
          onChange={toggleAll}
          label="Todas las organizaciones"
          hint="Apágalo para elegir una o varias organizaciones específicas."
        />
      </div>

      {mode === 'specific' && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs text-text-primary"
                >
                  {nameById.get(id) ?? id}
                  <button
                    type="button"
                    onClick={() => toggleOrg(id)}
                    className="text-text-secondary hover:text-text-primary"
                    aria-label={`Quitar ${nameById.get(id) ?? id}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              className={`${inputClass} pl-8`}
              placeholder="Buscar organización..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {isLoading ? (
              <p className="p-3 text-center text-xs text-text-secondary">Cargando…</p>
            ) : organizations.length === 0 ? (
              <p className="p-3 text-center text-xs text-text-secondary">Sin resultados.</p>
            ) : (
              <ul className="divide-y divide-border">
                {organizations.map((org) => (
                  <li key={org.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={value.includes(org.id)}
                        onChange={() => toggleOrg(org.id)}
                      />
                      {org.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className={`${labelClass} w-full border-t border-border py-2 text-center hover:bg-surface-secondary`}
              >
                {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
