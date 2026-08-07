import * as nodeCrypto from 'crypto';

/**
 * Alfabeto Crockford base32: sin I, L, O ni U, para que nadie confunda un 1 con
 * una l ni un 0 con una O al transcribir un código a mano.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Caracteres por código. 10 sobre un alfabeto de 32 dan 50 bits de entropía. */
const CODE_LENGTH = 10;

/** Dónde va el guion que parte el código en dos mitades legibles. */
const GROUP_SIZE = 5;

/**
 * Utilidades para códigos de respaldo de 2FA.
 *
 * Se hashean con SHA-256, no con bcrypt, por el mismo motivo que las API keys
 * (ver `api-key.util.ts`): son valores aleatorios de alta entropía, no
 * contraseñas elegidas por una persona, así que no hace falta un hash lento —
 * y uno determinista permite resolver el código con una sola búsqueda indexada
 * en vez de comparar contra las 10 filas del usuario.
 */
export class BackupCodeUtil {
  /**
   * Genera un código con formato `XXXXX-XXXXX`.
   *
   * El alfabeto tiene 32 caracteres y 32 divide a 256, así que `byte % 32`
   * reparte por igual y no introduce sesgo.
   */
  static generate(): string {
    const bytes = nodeCrypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (const byte of bytes) {
      code += ALPHABET[byte % ALPHABET.length];
    }

    return `${code.slice(0, GROUP_SIZE)}-${code.slice(GROUP_SIZE)}`;
  }

  /**
   * Deja un código en su forma canónica antes de hashearlo.
   *
   * Así `h4k92-7rtqm`, `H4K927RTQM` y `h4k92 7rtqm` resuelven al mismo hash y el
   * usuario puede teclear el código como le resulte natural.
   */
  static normalize(code: string): string {
    return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  /** Hashea un código ya normalizado. */
  static hash(code: string): string {
    return nodeCrypto.createHash('sha256').update(this.normalize(code)).digest('hex');
  }

  /**
   * ¿Tiene este texto la forma de un código de respaldo?
   *
   * Sirve para distinguirlo de un TOTP de 6 dígitos sin tener que consultar la
   * base de datos.
   */
  static looksLikeBackupCode(code: string): boolean {
    return this.normalize(code).length === CODE_LENGTH;
  }
}
