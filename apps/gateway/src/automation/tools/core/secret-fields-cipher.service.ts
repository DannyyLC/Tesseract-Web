import { Injectable } from '@nestjs/common';
import { KmsService } from './kms.service';

/** Marca de un valor cifrado: distingue un secreto ya cifrado de uno guardado en claro antes de existir esta capa. */
export const ENCRYPTED_PREFIX = 'kms:v1:';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;

/**
 * Cifra/descifra con KMS solo los campos secretos de un objeto JSON (p. ej.
 * `WhatsAppConfig.sessionData`), dejando el resto legible y consultable.
 *
 * - Formato por campo: `kms:v1:<base64 del ciphertext de KMS>`.
 * - Cada ciphertext queda atado a su `context` (id de la fila) y al nombre del campo mediante
 *   AAD de KMS: copiar el valor de otra fila, o de `appSecret` a `accessToken`, no descifra.
 * - Al leer, un valor sin el prefijo se devuelve tal cual (dato previo a esta capa), así no hace
 *   falta migrar en el despliegue. Se cifra al escribir de nuevo.
 * - Descifrar cuesta una llamada a KMS; el webhook público y cada envío lo pagarían, así que el
 *   resultado se cachea en memoria unos minutos. La llave del caché incluye el ciphertext, que
 *   cambia al rotar el secreto, por lo que no sirve un valor viejo.
 */
@Injectable()
export class SecretFieldsCipher {
  private readonly cache = new Map<string, { plaintext: string; expiresAt: number }>();

  constructor(private readonly kmsService: KmsService) {}

  async encryptFields<T extends Record<string, unknown>>(
    data: T,
    fields: readonly (keyof T & string)[],
    context: string,
  ): Promise<T> {
    const result: Record<string, unknown> = { ...data };
    for (const field of fields) {
      const value = result[field];
      if (typeof value !== 'string' || !value || value.startsWith(ENCRYPTED_PREFIX)) continue;
      const ciphertext = await this.kmsService.encrypt(value, this.aad(context, field));
      result[field] = `${ENCRYPTED_PREFIX}${ciphertext}`;
    }
    return result as T;
  }

  /**
   * Devuelve una copia con los campos en claro. Lanza si KMS falla: el llamador decide si eso es
   * reintentable (p. ej. el webhook responde 500 y Meta reintenta), no se devuelve un secreto vacío.
   */
  async decryptFields<T>(
    data: T,
    fields: readonly string[],
    context: string,
  ): Promise<T> {
    if (!data || typeof data !== 'object') return data;
    const result: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    for (const field of fields) {
      const value = result[field];
      if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) continue;
      result[field] = await this.decryptValue(
        value.slice(ENCRYPTED_PREFIX.length),
        this.aad(context, field),
      );
    }
    return result as T;
  }

  private async decryptValue(ciphertext: string, aad: string): Promise<string> {
    const key = `${aad}|${ciphertext}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.plaintext;

    const plaintext = await this.kmsService.decrypt(ciphertext, aad);

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    this.cache.set(key, { plaintext, expiresAt: Date.now() + CACHE_TTL_MS });
    return plaintext;
  }

  private aad(context: string, field: string): string {
    return `${context}:${field}`;
  }
}
