import { BadRequestException } from '@nestjs/common';
import { DatasetField } from '@tesseract/types';
import {
  liveFields,
  mergeFields,
  slugifyKey,
  validateFields,
  validateRecord,
} from './dataset-schema.validator';

const field = (overrides: Partial<DatasetField> & Pick<DatasetField, 'key' | 'type'>): DatasetField => ({
  label: overrides.key,
  order: 0,
  ...overrides,
});

describe('dataset-schema.validator', () => {
  describe('slugifyKey', () => {
    it('deriva una key válida de un label con acentos y símbolos', () => {
      expect(slugifyKey('Nivel de blindaje (NIJ)')).toBe('nivel_de_blindaje_nij');
      expect(slugifyKey('Año del modelo')).toBe('ano_del_modelo');
    });

    it('antepone un prefijo cuando el label empieza con número', () => {
      // Sin esto la key no sería un identificador válido para el parámetro de la tool.
      expect(slugifyKey('2024 modelo')).toBe('campo_2024_modelo');
    });
  });

  describe('validateFields', () => {
    it('acepta un schema con los cuatro tipos', () => {
      expect(() =>
        validateFields([
          field({ key: 'nombre', type: 'text' }),
          field({ key: 'precio', type: 'number' }),
          field({ key: 'marca', type: 'select', options: ['Toyota', 'Ford'] }),
          field({ key: 'ingreso', type: 'date' }),
        ]),
      ).not.toThrow();
    });

    it('rechaza una key reservada porque chocaría con los parámetros del buscador', () => {
      expect(() => validateFields([field({ key: 'limit', type: 'text' })])).toThrow(
        BadRequestException,
      );
    });

    it('rechaza una key que no es un identificador válido', () => {
      expect(() => validateFields([field({ key: 'Precio Total', type: 'text' })])).toThrow(
        BadRequestException,
      );
    });

    it('rechaza keys repetidas', () => {
      expect(() =>
        validateFields([field({ key: 'marca', type: 'text' }), field({ key: 'marca', type: 'text' })]),
      ).toThrow(BadRequestException);
    });

    it('exige opciones en un select', () => {
      expect(() => validateFields([field({ key: 'marca', type: 'select', options: [] })])).toThrow(
        BadRequestException,
      );
    });
  });

  describe('mergeFields', () => {
    it('marca como borrada la columna que ya no viene, sin eliminarla', () => {
      const current = [
        field({ key: 'marca', type: 'text' }),
        field({ key: 'precio', type: 'number' }),
      ];

      const merged = mergeFields(current, [field({ key: 'marca', type: 'text' })]);

      expect(merged).toHaveLength(2);
      expect(merged.find((item) => item.key === 'precio')?.deletedAt).toBeTruthy();
      expect(liveFields(merged).map((item) => item.key)).toEqual(['marca']);
    });

    it('restaura una columna borrada cuando se vuelve a mandar', () => {
      const current = [
        field({ key: 'marca', type: 'text' }),
        field({ key: 'precio', type: 'number', deletedAt: '2026-01-01T00:00:00.000Z' }),
      ];

      const merged = mergeFields(current, [
        field({ key: 'marca', type: 'text' }),
        field({ key: 'precio', type: 'number' }),
      ]);

      expect(merged.find((item) => item.key === 'precio')?.deletedAt).toBeNull();
    });

    it('impide cambiar el tipo de una columna existente', () => {
      const current = [field({ key: 'precio', type: 'number' })];

      expect(() => mergeFields(current, [field({ key: 'precio', type: 'text' })])).toThrow(
        BadRequestException,
      );
    });

    it('reasigna el orden según la posición recibida', () => {
      const merged = mergeFields(
        [],
        [field({ key: 'b', type: 'text' }), field({ key: 'a', type: 'text' })],
      );

      expect(merged.map((item) => [item.key, item.order])).toEqual([
        ['b', 0],
        ['a', 1],
      ]);
    });
  });

  describe('validateRecord', () => {
    const fields = [
      field({ key: 'nombre', type: 'text' }),
      field({ key: 'precio', type: 'number' }),
      field({ key: 'marca', type: 'select', options: ['Toyota', 'Ford'] }),
      field({ key: 'ingreso', type: 'date' }),
    ];

    it('guarda los números como number aunque lleguen como texto del CSV', () => {
      const result = validateRecord(fields, { precio: '320,000' });

      // El filtro por rango castea `(data->'precio')::numeric`: un string lo rompería.
      expect(result.precio).toBe(320000);
      expect(typeof result.precio).toBe('number');
    });

    it('rechaza un número mal escrito', () => {
      expect(() => validateRecord(fields, { precio: 'carísimo' })).toThrow(BadRequestException);
    });

    it('exige fecha AAAA-MM-DD y la guarda sin hora', () => {
      expect(validateRecord(fields, { ingreso: '2026-03-15' }).ingreso).toBe('2026-03-15');
      expect(() => validateRecord(fields, { ingreso: '15/03/2026' })).toThrow(BadRequestException);
    });

    it('rechaza un valor que no está entre las opciones del select', () => {
      expect(() => validateRecord(fields, { marca: 'Chevrolet' })).toThrow(BadRequestException);
    });

    it('rechaza columnas que no existen en el dataset', () => {
      expect(() => validateRecord(fields, { calibre: '9mm' })).toThrow(BadRequestException);
    });

    it('normaliza los vacíos a null y completa las columnas ausentes', () => {
      const result = validateRecord(fields, { nombre: 'Land Cruiser', precio: '' });

      expect(result).toEqual({
        nombre: 'Land Cruiser',
        precio: null,
        marca: null,
        ingreso: null,
      });
    });

    it('ignora las columnas borradas lógicamente', () => {
      const withDeleted = [
        field({ key: 'nombre', type: 'text' }),
        field({ key: 'viejo', type: 'text', deletedAt: '2026-01-01T00:00:00.000Z' }),
      ];

      expect(validateRecord(withDeleted, { nombre: 'X' })).toEqual({ nombre: 'X' });
      expect(() => validateRecord(withDeleted, { viejo: 'X' })).toThrow(BadRequestException);
    });
  });
});
