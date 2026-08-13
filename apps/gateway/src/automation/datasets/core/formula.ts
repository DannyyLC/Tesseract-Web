import { BadRequestException } from '@nestjs/common';
import { MAX_FORMULA_LENGTH } from '@tesseract/types';

/**
 * Evaluador de las fórmulas de las columnas calculadas.
 *
 * **Por qué un parser escrito a mano y no `eval`, `new Function` ni una librería:** la fórmula la
 * escribe el cliente y se ejecuta en el Gateway. Un parser de descenso recursivo solo puede
 * construir los cinco nodos que están declarados aquí abajo, así que no hay lista negra que
 * mantener al día — lo que no está en la gramática sencillamente no se puede expresar. Es el mismo
 * enfoque del `safe_eval` de `apps/agents/src/tools/calculator.py`, que camina el AST y rechaza
 * cualquier nodo que no esté en su whitelist.
 *
 * Gramática completa:
 *
 *     expr    := term (('+' | '-') term)*
 *     term    := factor (('*' | '/') factor)*
 *     factor  := '-'? primary
 *     primary := number | ident | call | '(' expr ')'
 *     call    := 'redondear' '(' expr (',' expr)? ')'
 *
 * **Un valor que no se puede calcular es `null`, nunca un error.** Falta un operando, hay una
 * división entre cero, el resultado se desborda: en los tres casos la celda queda vacía y la fila
 * se guarda igual. Un catálogo con una fila a medias es normal —el cliente todavía no captura el
 * precio— y reventar ahí impediría guardar el resto de los datos. `null` además ya se comporta bien
 * río abajo: `data->>'k'` da SQL NULL y el `NULLS LAST` de `buildOrderBy` deja esas filas al final
 * de "el más barato".
 *
 * Esta es la ÚNICA implementación del cálculo. El recálculo masivo de `updateFields` reusa estas
 * mismas funciones en vez de traducir la fórmula a SQL: dos evaluadores que pueden discrepar es
 * justo el fallo que las columnas calculadas existen para evitar.
 */

/** El único nombre de función que existe. Está en `RESERVED_KEYS`, así que no choca con una columna. */
export const ROUND_FUNCTION = 'redondear';

/** Tope de anidamiento de paréntesis. Impide que una fórmula absurda agote la pila del proceso. */
const MAX_DEPTH = 32;

/** Máximo de decimales que admite `redondear`. Más allá el double ya no distingue. */
const MAX_ROUND_DIGITS = 10;

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; key: string }
  | { kind: 'neg'; operand: FormulaNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
  | { kind: 'round'; value: FormulaNode; digits: FormulaNode | null };

type FormulaSymbol = '+' | '-' | '*' | '/' | '(' | ')' | ',';

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'symbol'; value: FormulaSymbol };

const SYMBOLS = new Set<string>(['+', '-', '*', '/', '(', ')', ',']);

/**
 * Corta la fórmula en tokens.
 *
 * Los identificadores usan el mismo alfabeto que `KEY_PATTERN` del validador de schema: si una
 * secuencia de caracteres no puede ser una `key` de columna, tampoco puede aparecer en una fórmula.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    if (char >= '0' && char <= '9') {
      let end = index;

      while (end < source.length && source[end] >= '0' && source[end] <= '9') {
        end += 1;
      }

      // Un solo punto decimal y nada de notación científica: `1e400` sería una forma barata de
      // meter un infinito en el catálogo.
      if (source[end] === '.') {
        end += 1;
        while (end < source.length && source[end] >= '0' && source[end] <= '9') {
          end += 1;
        }
      }

      const value = Number(source.slice(index, end));

      if (!Number.isFinite(value)) {
        throw new BadRequestException(`La fórmula tiene un número inválido: "${source.slice(index, end)}"`);
      }

      tokens.push({ type: 'number', value });
      index = end;
      continue;
    }

    if (char >= 'a' && char <= 'z') {
      let end = index;

      while (end < source.length && /[a-z0-9_]/.test(source[end])) {
        end += 1;
      }

      tokens.push({ type: 'ident', value: source.slice(index, end) });
      index = end;
      continue;
    }

    if (SYMBOLS.has(char)) {
      tokens.push({ type: 'symbol', value: char as FormulaSymbol });
      index += 1;
      continue;
    }

    throw new BadRequestException(
      `La fórmula usa un carácter que no se permite: "${char}". ` +
        'Solo se pueden usar nombres de columna, números, + - * / y paréntesis.',
    );
  }

  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const node = this.expression(0);

    if (this.position < this.tokens.length) {
      throw new BadRequestException('La fórmula tiene contenido de más; revisa los operadores y paréntesis');
    }

    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private eatSymbol(value: string): boolean {
    const token = this.peek();

    if (token?.type === 'symbol' && token.value === value) {
      this.position += 1;
      return true;
    }

    return false;
  }

  private expression(depth: number): FormulaNode {
    let left = this.term(depth);

    for (;;) {
      const token = this.peek();

      if (token?.type !== 'symbol' || (token.value !== '+' && token.value !== '-')) {
        return left;
      }

      this.position += 1;
      left = { kind: 'binary', op: token.value, left, right: this.term(depth) };
    }
  }

  private term(depth: number): FormulaNode {
    let left = this.factor(depth);

    for (;;) {
      const token = this.peek();

      if (token?.type !== 'symbol' || (token.value !== '*' && token.value !== '/')) {
        return left;
      }

      this.position += 1;
      left = { kind: 'binary', op: token.value, left, right: this.factor(depth) };
    }
  }

  private factor(depth: number): FormulaNode {
    if (this.eatSymbol('-')) {
      return { kind: 'neg', operand: this.factor(depth) };
    }

    return this.primary(depth);
  }

  private primary(depth: number): FormulaNode {
    if (depth > MAX_DEPTH) {
      throw new BadRequestException('La fórmula anida demasiados paréntesis');
    }

    const token = this.peek();

    if (!token) {
      throw new BadRequestException('La fórmula está incompleta; falta un valor');
    }

    if (token.type === 'number') {
      this.position += 1;
      return { kind: 'number', value: token.value };
    }

    if (token.type === 'ident') {
      this.position += 1;

      if (token.value === ROUND_FUNCTION) {
        return this.roundCall(depth);
      }

      return { kind: 'ref', key: token.value };
    }

    if (token.value === '(') {
      this.position += 1;
      const inner = this.expression(depth + 1);

      if (!this.eatSymbol(')')) {
        throw new BadRequestException('Falta cerrar un paréntesis en la fórmula');
      }

      return inner;
    }

    throw new BadRequestException(`La fórmula no esperaba "${token.value}" en esa posición`);
  }

  private roundCall(depth: number): FormulaNode {
    if (!this.eatSymbol('(')) {
      throw new BadRequestException(`\`${ROUND_FUNCTION}\` necesita paréntesis: ${ROUND_FUNCTION}(valor, decimales)`);
    }

    const value = this.expression(depth + 1);
    const digits = this.eatSymbol(',') ? this.expression(depth + 1) : null;

    if (!this.eatSymbol(')')) {
      throw new BadRequestException(`Falta cerrar el paréntesis de \`${ROUND_FUNCTION}\``);
    }

    return { kind: 'round', value, digits };
  }
}

/** Compila la fórmula. Lanza `BadRequestException` con un mensaje para el cliente si no es válida. */
export function parseFormula(source: string): FormulaNode {
  const trimmed = source.trim();

  if (!trimmed) {
    throw new BadRequestException('La fórmula está vacía');
  }

  if (trimmed.length > MAX_FORMULA_LENGTH) {
    throw new BadRequestException(`La fórmula excede ${MAX_FORMULA_LENGTH} caracteres`);
  }

  return new Parser(tokenize(trimmed)).parse();
}

/** Las columnas que la fórmula lee, sin repetir. Es la entrada del grafo de dependencias. */
export function formulaDependencies(node: FormulaNode): string[] {
  const keys = new Set<string>();

  const walk = (current: FormulaNode): void => {
    switch (current.kind) {
      case 'ref':
        keys.add(current.key);
        break;
      case 'neg':
        walk(current.operand);
        break;
      case 'binary':
        walk(current.left);
        walk(current.right);
        break;
      case 'round':
        walk(current.value);
        if (current.digits) {
          walk(current.digits);
        }
        break;
      default:
        break;
    }
  };

  walk(node);

  return [...keys];
}

/**
 * Redondeo con la mitad hacia afuera del cero, como el `REDONDEAR` de Excel (JS redondea `-2.5` a
 * `-2`, que no es lo que espera quien captura precios).
 *
 * Reposiciona el punto decimal sobre el texto en vez de multiplicar por `10**digits`: la
 * multiplicación arrastra su propio error y `1.005 * 100` da `100.49999999999999`, que redondearía
 * a `1.00` en lugar de a `1.01`.
 */
function roundHalfAwayFromZero(value: number, digits: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const text = String(magnitude);

  // Un magnitude ya en notación científica (muy grande o muy chico) no admite el truco del texto;
  // ahí el ruido de punto flotante es irrelevante frente al orden del número.
  if (text.includes('e')) {
    const factor = 10 ** digits;
    return (sign * Math.round(magnitude * factor)) / factor;
  }

  const shifted = Math.round(Number(`${text}e${digits}`));

  return sign * Number(`${shifted}e-${digits}`);
}

/**
 * Borra la basura de punto flotante del final del resultado.
 *
 * `320000 * 1.16` da `371200.00000000006` en IEEE754, y ese es literalmente el número que la tool le
 * entregaría al modelo para que se lo cotice al cliente. Recortar a 15 dígitos significativos —uno
 * menos de los ~17 que distinguen a un double— elimina el ruido sin tocar ningún dígito que el
 * cliente haya escrito de verdad.
 */
function scrubFloatNoise(value: number): number {
  return Number(value.toPrecision(15));
}

function evaluateNode(node: FormulaNode, values: Record<string, unknown>): number | null {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'ref': {
      const value = values[node.key];

      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    case 'neg': {
      const operand = evaluateNode(node.operand, values);

      return operand === null ? null : -operand;
    }

    case 'binary': {
      const left = evaluateNode(node.left, values);
      const right = evaluateNode(node.right, values);

      if (left === null || right === null) {
        return null;
      }

      if (node.op === '/' && right === 0) {
        return null;
      }

      const result =
        node.op === '+'
          ? left + right
          : node.op === '-'
            ? left - right
            : node.op === '*'
              ? left * right
              : left / right;

      return Number.isFinite(result) ? result : null;
    }

    case 'round': {
      const value = evaluateNode(node.value, values);

      if (value === null) {
        return null;
      }

      let digits = 0;

      if (node.digits) {
        const raw = evaluateNode(node.digits, values);

        if (raw === null) {
          return null;
        }

        // Se acota en vez de fallar: `redondear(x, 50)` es un error de captura, no una razón para
        // dejar la celda vacía.
        digits = Math.min(Math.max(Math.trunc(raw), 0), MAX_ROUND_DIGITS);
      }

      const result = roundHalfAwayFromZero(value, digits);

      return Number.isFinite(result) ? result : null;
    }

    default:
      return null;
  }
}

/**
 * Calcula el valor de la fórmula. `values` son los valores ya normalizados de la fila, indexados por
 * `key`; cualquier clave ausente o no numérica cuenta como faltante y vuelve `null` el resultado.
 */
export function evaluateFormula(node: FormulaNode, values: Record<string, unknown>): number | null {
  const result = evaluateNode(node, values);

  return result === null ? null : scrubFloatNoise(result);
}
