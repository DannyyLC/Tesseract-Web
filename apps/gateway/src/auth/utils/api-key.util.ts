import * as bcrypt from 'bcrypt';

/**
 * Utilidades para manejar API Keys con bcrypt
 */
export class ApiKeyUtil {
  /**
   * Número de rounds para bcrypt (10 es el estándar)
   */
  private static readonly SALT_ROUNDS = 10;

  /**
   * Hashea un API Key usando bcrypt
   * @param apiKey - El API key en texto plano
   * @returns Hash del API key
   */
  static async hash(apiKey: string): Promise<string> {
    return bcrypt.hash(apiKey, this.SALT_ROUNDS);
  }

  /**
   * Compara un API Key con su hash
   * @param apiKey - El API key en texto plano
   * @param hash - El hash almacenado en la DB
   * @returns true si coinciden, false si no
   */
  static async compare(apiKey: string, hash: string): Promise<boolean> {
    return bcrypt.compare(apiKey, hash);
  }

  /**
   * Extrae el prefijo del API Key para búsqueda rápida
   * Los primeros 10 caracteres del API key
   * @param apiKey - El API key completo
   * @returns Prefijo del API key
   */
  static extractPrefix(apiKey: string): string {
    return apiKey.substring(0, 16);
  }

  /**
   * Genera un API Key aleatorio con formato estándar
   * Formato: ak_{env}_{random}
   * @param env - Entorno: 'live' o 'test'
   * @returns API Key generado
   */
  static generate(env: 'live' | 'test' = 'live'): string {
    const randomPart = this.generateRandomString(32);
    return `ak_${env}_${randomPart}`;
  }

  /**
   * Genera una cadena aleatoria segura
   * @param length - Longitud de la cadena
   * @returns Cadena aleatoria
   */
  private static generateRandomString(length: number): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const randomArray = new Uint8Array(length);

    // Usar crypto del navegador/Node.js
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomArray);
    } else {
      // Fallback para Node.js antiguo
      const nodeCrypto = require('crypto');
      nodeCrypto.randomFillSync(randomArray);
    }

    for (let i = 0; i < length; i++) {
      result += chars[randomArray[i] % chars.length];
    }

    return result;
  }
}
