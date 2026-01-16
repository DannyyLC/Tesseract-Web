import * as nodeCrypto from 'crypto';

/**
 * Utilidades para manejar API Keys con hashing determinista (SHA-256)
 */
export class ApiKeyUtil {
  /**
   * Hashea un API Key usando SHA-256 (determinista para búsqueda rápida)
   * @param apiKey - El API key en texto plano
   * @returns Hash del API key en formato hexadecimal
   */
  static async hash(apiKey: string): Promise<string> {
    return nodeCrypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Compara un API Key con su hash
   * @param apiKey - El API key en texto plano
   * @param hash - El hash almacenado en la DB
   * @returns true si coinciden, false si no
   */
  static async compare(apiKey: string, hash: string): Promise<boolean> {
    const incomingHash = await this.hash(apiKey);
    return incomingHash === hash;
  }

  /**
   * Genera un API Key aleatorio con formato estándar
   * Formato: ak_{env}_{random}
   * @param env - Entorno: 'live' o 'test'
   * @returns API Key generado
   */
  static generate(env: 'live' | 'test' = 'live'): string {
    const randomPart = nodeCrypto.randomBytes(32).toString('hex');
    return `ak_${env}_${randomPart}`;
  }
}
