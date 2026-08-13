import { BadRequestException } from '@nestjs/common';
import { evaluateFormula, formulaDependencies, parseFormula } from './formula';

/**
 * El evaluador corre expresiones que escribe el cliente, así que la mitad de este archivo prueba lo
 * que NO se puede expresar. La otra mitad protege el resultado numérico: una columna calculada
 * termina en la boca del agente cotizándole a un comprador, así que un decimal de más no es un
 * detalle estético.
 */
describe('formula', () => {
  const evaluate = (source: string, values: Record<string, unknown> = {}) =>
    evaluateFormula(parseFormula(source), values);

  describe('aritmética', () => {
    it('respeta la precedencia y los paréntesis', () => {
      expect(evaluate('2 + 3 * 4')).toBe(14);
      expect(evaluate('(2 + 3) * 4')).toBe(20);
      expect(evaluate('10 / 4')).toBe(2.5);
      expect(evaluate('10 - 3 - 2')).toBe(5); // asociativo por la izquierda
    });

    it('acepta negativos y decimales', () => {
      expect(evaluate('-5 + 2')).toBe(-3);
      expect(evaluate('-(3 * 2)')).toBe(-6);
      expect(evaluate('1.5 * 2')).toBe(3);
    });

    it('resuelve referencias a columnas', () => {
      expect(evaluate('precio_base * 2', { precio_base: 1000 })).toBe(2000);
    });

    it('aplica el caso real del catálogo de vehículos', () => {
      const values = { precio_base: 320000, porcentaje: 16 };

      expect(evaluate('precio_base * (1 + porcentaje / 100)', values)).toBe(371200);
    });
  });

  describe('ruido de punto flotante', () => {
    /**
     * Sin el recorte a 15 dígitos significativos esto da 371200.00000000006, y ese número es
     * exactamente lo que la tool le entrega al modelo para que lo cotice.
     */
    it('no arrastra basura de IEEE754 al resultado', () => {
      expect(evaluate('320000 * 1.16')).toBe(371200);
      expect(evaluate('0.1 + 0.2')).toBe(0.3);
    });

    it('redondea con la mitad hacia afuera del cero, no como Math.round', () => {
      expect(evaluate('redondear(2.5)')).toBe(3);
      expect(evaluate('redondear(-2.5)')).toBe(-3);
    });

    it('redondea a los decimales pedidos sin el error de multiplicar', () => {
      expect(evaluate('redondear(1.005, 2)')).toBe(1.01);
      expect(evaluate('redondear(precio, 2)', { precio: 1234.5678 })).toBe(1234.57);
    });

    it('acota los decimales absurdos en vez de vaciar la celda', () => {
      expect(evaluate('redondear(1.23456, 50)')).toBe(1.23456);
    });
  });

  describe('valores que no se pueden calcular → null', () => {
    it('propaga null cuando falta un operando', () => {
      expect(evaluate('precio_base * porcentaje', { precio_base: 100 })).toBeNull();
      expect(evaluate('precio_base + 1', { precio_base: null })).toBeNull();
      expect(evaluate('precio_base + 1', { precio_base: 'no es número' })).toBeNull();
    });

    it('devuelve null en una división entre cero', () => {
      expect(evaluate('precio / descuento', { precio: 100, descuento: 0 })).toBeNull();
    });

    it('devuelve null si el resultado se desborda', () => {
      expect(evaluate('grande * grande', { grande: 1e200 })).toBeNull();
    });
  });

  describe('lo que la gramática no permite expresar', () => {
    const rejected = [
      ['una llamada a función arbitraria', 'eval(1)'],
      ['acceso a propiedades', 'foo.bar'],
      ['potencias', '2 ** 10'],
      ['módulo', '10 % 3'],
      ['comparadores', 'precio > 100'],
      ['asignación', 'x = 5'],
      ['mayúsculas', 'Precio + 1'],
      ['comillas', "'texto'"],
      ['un paréntesis sin cerrar', '(1 + 2'],
      ['un paréntesis de más', '1 + 2)'],
      ['un operador colgando', '1 +'],
      ['una fórmula vacía', '   '],
      ['notación científica', '1e400'],
    ];

    it.each(rejected)('rechaza %s', (_descripcion, source) => {
      expect(() => parseFormula(source)).toThrow(BadRequestException);
    });

    it('rechaza una fórmula más larga que el tope', () => {
      expect(() => parseFormula(`1 ${'+ 1 '.repeat(200)}`)).toThrow(BadRequestException);
    });

    it('rechaza demasiados paréntesis anidados', () => {
      expect(() => parseFormula(`${'('.repeat(40)}1${')'.repeat(40)}`)).toThrow(BadRequestException);
    });

    /**
     * `constructor` es el caso peligroso de verdad: es un identificador válido según `KEY_PATTERN`
     * —o sea que el parser lo acepta como nombre de columna— y además existe en el prototipo de
     * todo objeto de JS. `values['constructor']` devuelve una función, no un número, así que el
     * filtro de tipo del nodo `ref` la descarta y la celda queda vacía.
     */
    it('una key que existe en el prototipo de Object evalúa a null, no al objeto heredado', () => {
      expect(evaluate('constructor', {})).toBeNull();
      expect(evaluate('constructor * 2', { precio: 10 })).toBeNull();
    });
  });

  describe('formulaDependencies', () => {
    it('devuelve las columnas sin repetir y sin el nombre de la función', () => {
      const node = parseFormula('redondear(precio_base * (1 + precio_base / total), 2)');

      expect(formulaDependencies(node).sort()).toEqual(['precio_base', 'total']);
    });

    it('devuelve vacío en una fórmula de puras constantes', () => {
      expect(formulaDependencies(parseFormula('2 + 2'))).toEqual([]);
    });
  });
});
