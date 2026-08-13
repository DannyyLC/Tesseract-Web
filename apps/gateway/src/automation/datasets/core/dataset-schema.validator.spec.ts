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

  /**
   * Columnas calculadas. El objetivo de todo esto es que el precio ya le llegue resuelto al modelo,
   * así que lo que se protege aquí es que el valor guardado sea el correcto y que nunca dependa de
   * lo que el cliente (o el propio front) mande en la fila.
   */
  describe('columnas calculadas', () => {
    const catalogo = [
      field({ key: 'precio_base', type: 'number', label: 'Precio base', order: 0 }),
      field({ key: 'porcentaje', type: 'number', label: 'Porcentaje', order: 1 }),
      field({
        key: 'precio_final',
        type: 'number',
        label: 'Precio final',
        order: 2,
        formula: 'round(precio_base * (1 + porcentaje / 100), 2)',
      }),
    ];

    describe('validateFields', () => {
      it('acepta una fórmula sobre columnas numéricas', () => {
        expect(() => validateFields(catalogo)).not.toThrow();
      });

      it('rechaza una fórmula en una columna que no es numérica', () => {
        const invalid = [
          field({ key: 'precio', type: 'number' }),
          field({ key: 'etiqueta', type: 'text', formula: 'precio * 2' }),
        ];

        expect(() => validateFields(invalid)).toThrow(BadRequestException);
      });

      it('rechaza una fórmula que suma una columna de texto', () => {
        const invalid = [
          field({ key: 'nombre', type: 'text' }),
          field({ key: 'total', type: 'number', formula: 'nombre + 1' }),
        ];

        expect(() => validateFields(invalid)).toThrow(BadRequestException);
      });

      it('rechaza una fórmula con sintaxis inválida', () => {
        const invalid = [field({ key: 'total', type: 'number', formula: '1 +' })];

        expect(() => validateFields(invalid)).toThrow(BadRequestException);
      });

      it('rechaza un ciclo directo y uno indirecto', () => {
        const directo = [
          field({ key: 'a', type: 'number', formula: 'b + 1' }),
          field({ key: 'b', type: 'number', formula: 'a + 1' }),
        ];
        const indirecto = [
          field({ key: 'a', type: 'number', formula: 'b + 1' }),
          field({ key: 'b', type: 'number', formula: 'c + 1' }),
          field({ key: 'c', type: 'number', formula: 'a + 1' }),
        ];
        const propio = [field({ key: 'a', type: 'number', formula: 'a + 1' })];

        expect(() => validateFields(directo)).toThrow(BadRequestException);
        expect(() => validateFields(indirecto)).toThrow(BadRequestException);
        expect(() => validateFields(propio)).toThrow(BadRequestException);
      });

      it('acepta que una calculada dependa de otra calculada', () => {
        const encadenadas = [
          field({ key: 'base', type: 'number' }),
          field({ key: 'con_iva', type: 'number', formula: 'base * 1.16' }),
          field({ key: 'con_envio', type: 'number', formula: 'con_iva + 500' }),
        ];

        expect(() => validateFields(encadenadas)).not.toThrow();
      });

      /**
       * Decisión de producto: borrar una columna de la que depende una fórmula se permite, y la
       * columna calculada queda vacía. Bloquear el guardado aquí lo impediría.
       */
      it('acepta una fórmula que referencia una columna inexistente', () => {
        const huerfana = [
          field({ key: 'precio_total', type: 'number', formula: 'precio_que_ya_no_existe * 2' }),
        ];

        expect(() => validateFields(huerfana)).not.toThrow();
      });

      it('reserva el nombre de la función de redondeo como key', () => {
        expect(() => validateFields([field({ key: 'round', type: 'number' })])).toThrow(
          BadRequestException,
        );
      });
    });

    describe('validateRecord', () => {
      it('calcula el valor y lo guarda como número', () => {
        const result = validateRecord(catalogo, { precio_base: '320000', porcentaje: '16' });

        expect(result.precio_final).toBe(371200);
      });

      /**
       * La rejilla del front manda la fila completa, incluidas las celdas calculadas que ella misma
       * pinta como solo lectura. Si esto lanzara, editar cualquier fila sería imposible.
       */
      it('ignora el valor que venga para una columna calculada, sin lanzar', () => {
        const result = validateRecord(catalogo, {
          precio_base: 100,
          porcentaje: 10,
          precio_final: 999999,
        });

        expect(result.precio_final).toBe(110);
      });

      it('deja null cuando falta un operando, sin tumbar la fila', () => {
        const result = validateRecord(catalogo, { precio_base: 320000 });

        expect(result.precio_final).toBeNull();
        expect(result.precio_base).toBe(320000);
      });

      it('encadena en orden topológico aunque el `order` diga lo contrario', () => {
        // `con_envio` va primero en el arreglo y depende de `con_iva`, que va después.
        const encadenadas = [
          field({ key: 'con_envio', type: 'number', order: 0, formula: 'con_iva + 500' }),
          field({ key: 'con_iva', type: 'number', order: 1, formula: 'base * 1.16' }),
          field({ key: 'base', type: 'number', order: 2 }),
        ];

        const result = validateRecord(encadenadas, { base: 1000 });

        expect(result.con_iva).toBe(1160);
        expect(result.con_envio).toBe(1660);
      });

      /**
       * El borrado de columna es lógico: el valor sigue físicamente dentro del JSON de la fila. Si
       * el evaluador resolviera contra `data` en vez de contra las columnas vivas, la fórmula
       * seguiría calculando con una columna que ya no existe para nadie.
       */
      it('da null si la fórmula depende de una columna borrada, aunque su valor siga en la fila', () => {
        const conBorrada = [
          field({ key: 'precio_base', type: 'number' }),
          field({
            key: 'porcentaje',
            type: 'number',
            deletedAt: '2026-01-01T00:00:00.000Z',
          }),
          field({
            key: 'precio_final',
            type: 'number',
            formula: 'precio_base * (1 + porcentaje / 100)',
          }),
        ];

        const result = validateRecord(conBorrada, { precio_base: 320000 });

        expect(result.precio_final).toBeNull();
      });
    });

    describe('mergeFields', () => {
      it('quita la fórmula cuando el campo entrante ya no la trae', () => {
        const entrante = [field({ key: 'precio_final', type: 'number', label: 'Precio final' })];
        const merged = mergeFields([catalogo[2]], entrante);

        expect(merged[0].formula).toBeUndefined();
      });

      it('conserva `type: number` en una columna calculada', () => {
        // Es el candado de la decisión de diseño: si esto cambiara, el orden por precio pasaría a
        // ser alfabético y el servicio de agentes dejaría de ofrecer el filtro por rango.
        const merged = mergeFields(catalogo, catalogo);

        expect(merged.find((f) => f.key === 'precio_final')?.type).toBe('number');
      });
    });
  });
});
