import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DatasetField, DatasetRecordDto } from '@tesseract/types';
import { RecordsGrid } from './records-grid';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const LONG_TEXT =
  'Descripción muy larga que no cabe en la celda y que antes solo se podía leer en el tooltip';

const fields: DatasetField[] = [
  { key: 'nombre', label: 'Nombre', type: 'text', order: 0 },
  { key: 'descripcion', label: 'Descripción', type: 'text', order: 1 },
  { key: 'precio', label: 'Precio', type: 'number', order: 2 },
];

const records = [
  { id: 'r1', data: { nombre: 'Uno', descripcion: LONG_TEXT, precio: 10 } },
  { id: 'r2', data: { nombre: 'Dos', descripcion: 'Corta', precio: 20 } },
] as unknown as DatasetRecordDto[];

function renderGrid(props: Partial<React.ComponentProps<typeof RecordsGrid>> = {}) {
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const onCreate = jest.fn().mockResolvedValue(undefined);
  render(
    <RecordsGrid
      fields={fields}
      records={records}
      onCreate={onCreate}
      onUpdate={onUpdate}
      {...props}
    />,
  );
  return { onUpdate, onCreate };
}

const expandButtons = () => screen.getAllByRole('button', { name: 'expandRow' });
const panels = () => screen.queryAllByRole('definition').length;

describe('RecordsGrid — fila expandible', () => {
  it('abre el panel con el valor completo y lo vuelve a cerrar', async () => {
    const user = userEvent.setup();
    renderGrid();

    expect(panels()).toBe(0);
    await user.click(expandButtons()[0]);

    // Una columna por renglón: el texto largo aparece completo, no recortado.
    expect(panels()).toBe(fields.length);
    expect(screen.getAllByText(LONG_TEXT)).toHaveLength(2); // celda recortada + panel

    await user.click(screen.getByRole('button', { name: 'collapseRow' }));
    expect(panels()).toBe(0);
  });

  it('solo deja una fila abierta a la vez', async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(expandButtons()[0]);
    await user.click(expandButtons()[0]); // tras abrir la primera, el único "expandRow" es de r2

    expect(screen.getAllByRole('button', { name: 'collapseRow' })).toHaveLength(1);
    expect(panels()).toBe(fields.length);
    expect(screen.getAllByText('Corta')).toHaveLength(2);
    expect(screen.getAllByText(LONG_TEXT)).toHaveLength(1); // r1 ya cerró
  });

  it('funciona también en solo lectura', async () => {
    const user = userEvent.setup();
    renderGrid({ readOnly: true });

    await user.click(expandButtons()[0]);
    expect(panels()).toBe(fields.length);
    expect(screen.queryByRole('button', { name: 'edit' })).not.toBeInTheDocument();
  });

  it('al editar abre el panel con textarea para el texto y guarda el borrador', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderGrid();

    await user.click(screen.getAllByRole('button', { name: 'edit' })[0]);

    const descripcion = screen.getByRole('textbox', { name: 'Descripción' });
    expect(descripcion.tagName).toBe('TEXTAREA');
    expect(screen.getByRole('spinbutton', { name: 'Precio' })).toHaveValue(10);

    // Mientras se edita, ninguna fila se puede abrir ni cerrar.
    expect(screen.getByRole('button', { name: 'collapseRow' })).toBeDisabled();
    expandButtons().forEach((button) => expect(button).toBeDisabled());

    await user.clear(descripcion);
    await user.type(descripcion, 'Nuevo texto');

    // Una sola forma de guardar y de cancelar: al pie del panel, no repetidas en la fila.
    expect(screen.getAllByRole('button', { name: 'save' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'cancel' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(onUpdate).toHaveBeenCalledWith('r1', {
      nombre: 'Uno',
      descripcion: 'Nuevo texto',
      precio: '10',
    });
  });

  it('agregar fila captura en el panel', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderGrid();

    await user.click(screen.getByRole('button', { name: /addRow/ }));
    const row = screen.getByRole('textbox', { name: 'Nombre' }).closest('td') as HTMLElement;

    await user.type(within(row).getByRole('textbox', { name: 'Nombre' }), 'Tres');
    await user.click(within(row).getByRole('button', { name: 'save' }));

    expect(onCreate).toHaveBeenCalledWith({ nombre: 'Tres', descripcion: '', precio: '' });
  });
});
